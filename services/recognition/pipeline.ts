import { PositionedCard } from '@/types/poker';
import { Variant } from './imageOps';
import {
  INPUT_SIZE, Detection, Region, codeToCard, mergeByCode, nonMaxSuppression, selectCards, tileRegions,
} from './yolo';

export type PassRunner = (region: Region, variant: Variant) => Promise<Detection[]>;
export type ProgressListener = (message: string) => void;

/**
 * Detections already known for part of the picture (cards whose rank and suit
 * are printed apart, which the standard passes misread). The standard passes'
 * guesses at those spots are discarded so they cannot outvote the known cards.
 */
/** Only a confident reading is allowed to veto the standard detector at its spot. */
const SEED_VETO_CONFIDENCE = 0.5;

export function outsideSeededSpots(detections: Detection[], seed: Detection[]): Detection[] {
  const trusted = seed.filter((detection) => detection.confidence >= SEED_VETO_CONFIDENCE);
  if (!trusted.length) return detections;
  const spots = trusted.map(({ box: [x1, y1, x2, y2] }) => {
    const margin = 0.5 * (y2 - y1);
    return [x1 - margin, y1 - margin, x2 + margin, y2 + margin];
  });
  return detections.filter((detection) => {
    const x = (detection.box[0] + detection.box[2]) / 2;
    const y = (detection.box[1] + detection.box[3]) / 2;
    return !spots.some(([x1, y1, x2, y2]) => x >= x1 && x <= x2 && y >= y1 && y <= y2);
  });
}

export function withoutSeededSpots(run: PassRunner, seed: Detection[]): PassRunner {
  if (!seed.length) return run;
  return async (region, variant) => outsideSeededSpots(await run(region, variant), seed);
}

interface Pass {
  region: Region;
  variant: Variant;
}

export interface DetectionOutcome {
  detections: Detection[];
  passes: number;
}

/** A result is good enough to stop escalating when every expected card is clearly read. */
export const SATISFIED_CONFIDENCE = 0.45;

function isSatisfied(merged: Detection[], expected: number): boolean {
  const top = selectCards(merged, expected);
  return top.length >= expected && top.every((detection) => detection.confidence >= SATISFIED_CONFIDENCE);
}

/**
 * Finds `expected` unique cards in a photo. A sharp, well-framed photo is read
 * in a single pass. Blurry, dark or distant photos escalate through sharpened
 * variants and overlapping tiles until every card is clearly read.
 */
export async function detectCards(
  rawRun: PassRunner,
  width: number,
  height: number,
  expected: number,
  onProgress?: ProgressListener,
  seed: Detection[] = [],
): Promise<DetectionOutcome> {
  const run = withoutSeededSpots(rawRun, seed);
  const full: Region = { x: 0, y: 0, width, height };
  const tiles = tileRegions(width, height);
  const stages: Pass[][] = [
    [{ region: full, variant: 'plain' }],
    (['sharp1', 'sharp3', 'sharp5'] as Variant[]).map((variant) => ({ region: full, variant })),
    tiles.map((region) => ({ region, variant: 'plain' as Variant })),
    [
      ...tiles.map((region) => ({ region, variant: 'sharp3' as Variant })),
      { region: full, variant: 'sharpH' as Variant },
      { region: full, variant: 'sharpV' as Variant },
    ],
  ];

  let all: Detection[] = [...seed];
  let passes = 0;
  if (seed.length && isSatisfied(mergeByCode(nonMaxSuppression(all)), expected)) {
    return { detections: selectCards(mergeByCode(nonMaxSuppression(all)), expected), passes };
  }
  for (const [index, stage] of stages.entries()) {
    if (index > 0) onProgress?.('Looking closer…');
    for (const pass of stage) {
      all = all.concat(nonMaxSuppression(await run(pass.region, pass.variant)));
      passes += 1;
    }
    const merged = mergeByCode(nonMaxSuppression(all));
    if (isSatisfied(merged, expected)) break;
  }
  return { detections: selectCards(mergeByCode(nonMaxSuppression(all)), expected), passes };
}

const WINDOW_STRIDE = 0.6;

/** Windows covering the image, each `coverage` of its size, overlapping by more than a card. */
export function gridRegions(width: number, height: number, coverage: number): Region[] {
  const tileWidth = Math.round(width * coverage);
  const tileHeight = Math.round(height * coverage);
  const count = Math.max(1, Math.ceil((1 - coverage) / (coverage * WINDOW_STRIDE)) + 1);
  const position = (index: number, total: number, tile: number) =>
    count === 1 ? 0 : Math.round((index * (total - tile)) / (count - 1));
  const regions: Region[] = [];
  for (let row = 0; row < count; row += 1) {
    for (let column = 0; column < count; column += 1) {
      regions.push({
        x: position(column, width, tileWidth),
        y: position(row, height, tileHeight),
        width: tileWidth,
        height: tileHeight,
      });
    }
  }
  return regions;
}

/** A whole-table photo needs at least a 5-card board and one 2-card hand. */
const MIN_TABLE_CARDS = 7;
const validCount = (count: number) => count >= MIN_TABLE_CARDS && (count - 5) % 2 === 0;

const centre = (d: Detection) => ({ x: (d.box[0] + d.box[2]) / 2, y: (d.box[1] + d.box[3]) / 2 });
const boxHeight = (d: Detection) => d.box[3] - d.box[1];

/** Weakest detection kept in table mode; weak ones must also match the layout (see `positionedCards`). */
export const TABLE_WEAK_CONFIDENCE = 0.02;
/** At or above this a detection is trusted on its own and sets the expected card size. */
export const TABLE_STRONG_CONFIDENCE = 0.25;
const SIZE_RANGE: [number, number] = [0.7, 1.4];
/** A weak box this close to a kept corner is a ghost of that corner, not another card. */
const GHOST_DISTANCE = 0.8;
const MAX_WEAK_FILL = 4;
const NEAR_ANCHOR = 6;
const MAX_PAIR_DISTANCE = 5.5;
/** Opposite corners of one card differ clearly in both x and y; side-by-side cards do not. */
const MIN_DIAGONAL = 0.5;

interface Cluster {
  x: number;
  y: number;
  size: number;
  votes: Map<string, { sum: number; max: number }>;
  solid: boolean;
}

const winningVote = (cluster: Cluster) =>
  [...cluster.votes.entries()].sort((a, b) => b[1].sum - a[1].sum)[0];

/** Confidence of the code this corner is most likely, so a corner whose reading flips between codes stays weak. */
const clusterBest = (cluster: Cluster) => winningVote(cluster)[1].max;

/** Groups detections of the same physical corner seen in different passes. */
function clusterDetections(detections: Detection[]): Cluster[] {
  const clusters: Cluster[] = [];
  for (const detection of [...detections].sort((a, b) => b.confidence - a.confidence)) {
    const c = centre(detection);
    const size = boxHeight(detection);
    const home = clusters.find((cluster) => {
      const ratio = size / cluster.size;
      return ratio > 0.5 && ratio < 2 && Math.hypot(c.x - cluster.x, c.y - cluster.y) < 0.5 * Math.min(size, cluster.size);
    });
    const target = home ?? { x: c.x, y: c.y, size, votes: new Map(), solid: false };
    if (detection.solid) target.solid = true;
    if (!home) clusters.push(target);
    const vote = target.votes.get(detection.code) ?? { sum: 0, max: 0 };
    target.votes.set(detection.code, {
      sum: vote.sum + detection.confidence,
      max: Math.max(vote.max, detection.confidence),
    });
  }
  return clusters;
}

function assignCards(clusters: Cluster[]): PositionedCard[] {
  const assigned = new Map<string, Cluster[]>();
  for (const cluster of [...clusters].sort((a, b) => clusterBest(b) - clusterBest(a))) {
    const choices = [...cluster.votes.entries()].sort((a, b) => b[1].sum - a[1].sum);
    for (const [code] of choices) {
      const holders = assigned.get(code);
      if (!holders) {
        assigned.set(code, [cluster]);
        break;
      }
      const dx = Math.abs(holders[0].x - cluster.x);
      const dy = Math.abs(holders[0].y - cluster.y);
      const unit = holders[0].size;
      const diagonal = Math.min(dx, dy) >= MIN_DIAGONAL * unit && Math.hypot(dx, dy) <= MAX_PAIR_DISTANCE * unit;
      if (holders.length === 1 && diagonal) {
        holders.push(cluster);
        break;
      }
    }
  }

  return [...assigned.entries()].map(([code, holders]) => ({
    code,
    card: codeToCard(code),
    confidence: Math.max(...holders.map((holder) => holder.votes.get(code)?.max ?? 0)),
    x: holders.reduce((sum, holder) => sum + holder.x, 0) / holders.length,
    y: holders.reduce((sum, holder) => sum + holder.y, 0) / holders.length,
    size: holders[0].size,
  }));
}

/**
 * Turns raw corner detections from many passes into one positioned card per
 * code.
 *
 * - Detections of the same corner are voted on across passes.
 * - Strong detections are kept. When they do not add up to a valid table, the
 *   best weak ones that match the strong ones in size and sit near them fill
 *   the gap, which rescues correctly read but low-confidence cards without
 *   admitting stray boxes.
 * - A card shows its index in two opposite corners; when both are seen the
 *   midpoint is the card centre. Two cards cannot share a code, so a second
 *   far-away detection of the same code falls back to its next-best code.
 */
export function positionedCards(detections: Detection[]): PositionedCard[] {
  const all = clusterDetections(detections.filter((d) => d.confidence >= TABLE_WEAK_CONFIDENCE));
  const strong = all.filter((cluster) => clusterBest(cluster) >= TABLE_STRONG_CONFIDENCE);
  const anchors = strong.length ? strong : [...all].sort((a, b) => clusterBest(b) - clusterBest(a)).slice(0, 3);
  if (!anchors.length) return [];
  const reference = median(anchors.map((cluster) => cluster.size));

  const kept = all.filter((cluster) => clusterBest(cluster) >= TABLE_STRONG_CONFIDENCE);
  for (const anchor of anchors) if (!kept.includes(anchor)) kept.push(anchor);

  // Weak detections only fill gaps: they are added, best first, while the
  // confident cards alone cannot form a valid table.
  const sizeMatches = (cluster: Cluster) => {
    const ratio = cluster.size / reference;
    return ratio >= SIZE_RANGE[0] && ratio <= SIZE_RANGE[1];
  };
  const distanceTo = (a: Cluster, b: Cluster) => Math.hypot(a.x - b.x, a.y - b.y);
  const candidates = all
    .filter((cluster) => !kept.includes(cluster) && sizeMatches(cluster))
    .sort((a, b) => clusterBest(b) - clusterBest(a));
  let added = 0;
  while (!validCount(assignCards(kept).length) && added < MAX_WEAK_FILL) {
    const next = candidates.find(
      (cluster) =>
        !kept.includes(cluster) &&
        kept.some((other) => distanceTo(other, cluster) <= NEAR_ANCHOR * reference) &&
        kept.every(
          (other) => (cluster.solid && other.solid) || distanceTo(other, cluster) > GHOST_DISTANCE * Math.min(other.size, cluster.size),
        ),
    );
    if (!next) break;
    kept.push(next);
    added += 1;
  }

  return assignCards(kept);
}

export interface TableOutcome {
  cards: PositionedCard[];
  passes: number;
}

const codeSet = (cards: PositionedCard[]) => cards.map((card) => card.code).sort().join(',');

/** Corner-index height, in the 640 px model input, at which the detector reads best. */
const TARGET_CORNER = 42;
const MIN_COVERAGE = 0.3;
const MAX_COVERAGE = 0.75;

const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

/** Window coverage that brings the cards found so far to the size the detector likes. */
function zoomCoverage(cards: PositionedCard[], width: number, height: number): number {
  if (!cards.length) return 0.5;
  const window = (INPUT_SIZE * median(cards.map((card) => card.size))) / TARGET_CORNER;
  return Math.min(MAX_COVERAGE, Math.max(MIN_COVERAGE, window / Math.max(width, height)));
}

/**
 * Scans a table photo in escalating rounds, because the right zoom level
 * depends on how large the cards are in the picture. After a quick first
 * round it measures the cards it found and zooms to the size the detector
 * reads best, then keeps looking, finally with enhanced images, until two
 * consecutive rounds agree on a valid table. A valid card count alone is not
 * proof that nothing is missing, so a scan never stops after a single round.
 */
export async function detectTable(
  rawRun: PassRunner,
  width: number,
  height: number,
  onProgress?: ProgressListener,
  seed: Detection[] = [],
): Promise<TableOutcome> {
  const run = withoutSeededSpots(rawRun, seed);
  const full: Region = { x: 0, y: 0, width, height };
  const used: number[] = [MAX_COVERAGE];
  const fresh = (coverage: number) => used.every((other) => Math.abs(other - coverage) >= 0.05);

  type Round = { label: string; passes: { region: Region; variant: Variant }[] };
  const plain = (regions: Region[]) => regions.map((region) => ({ region, variant: 'plain' as Variant }));
  const roundFor = (index: number, cards: PositionedCard[]): Round | null => {
    const zoom = zoomCoverage(cards, width, height);
    if (index === 1) {
      const coverage = fresh(zoom) ? zoom : 0.5;
      used.push(coverage);
      return { label: 'Looking closer', passes: plain(gridRegions(width, height, coverage)) };
    }
    if (index === 2) {
      const coverage = [zoom * 0.7, zoom * 1.4, 0.5, 0.4].find((candidate) => candidate >= MIN_COVERAGE && candidate < 1 && fresh(candidate));
      if (!coverage) return null;
      used.push(coverage);
      return { label: 'Looking even closer', passes: plain(gridRegions(width, height, coverage)) };
    }
    if (index === 3) {
      const regions = [full, ...used.flatMap((coverage) => gridRegions(width, height, coverage))];
      return { label: 'Enhancing the photo', passes: regions.map((region) => ({ region, variant: 'sharp3' as Variant })) };
    }
    return null;
  };

  let all: Detection[] = [...seed];
  let passes = 0;
  let cards: PositionedCard[] = [];
  let previous = '';
  let round: Round | null = {
    label: 'Scanning the table',
    passes: plain([full, ...gridRegions(width, height, MAX_COVERAGE)]),
  };
  for (let index = 0; round; index += 1) {
    for (const [step, pass] of round.passes.entries()) {
      onProgress?.(`${round.label}… ${step + 1}/${round.passes.length}${index ? ` (round ${index + 1})` : ''}`);
      all = all.concat(await run(pass.region, pass.variant));
      passes += 1;
    }
    cards = positionedCards(all);
    const signature = codeSet(cards.filter((card) => card.confidence >= TABLE_STRONG_CONFIDENCE));
    if (validCount(cards.length) && index > 0 && signature === previous) break;
    previous = signature;
    round = roundFor(index + 1, cards);
  }
  return { cards, passes };
}
