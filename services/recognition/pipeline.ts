import { PositionedCard } from '@/types/poker';
import { Variant } from './imageOps';
import {
  Detection, Region, codeToCard, mergeByCode, nonMaxSuppression, selectCards, tileRegions,
} from './yolo';

export type PassRunner = (region: Region, variant: Variant) => Promise<Detection[]>;
export type ProgressListener = (message: string) => void;

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
  run: PassRunner,
  width: number,
  height: number,
  expected: number,
  onProgress?: ProgressListener,
): Promise<DetectionOutcome> {
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

  let all: Detection[] = [];
  let passes = 0;
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

export function gridRegions(width: number, height: number, columns: number, rows: number, coverage: number): Region[] {
  const tileWidth = Math.round(width * coverage);
  const tileHeight = Math.round(height * coverage);
  const position = (index: number, count: number, total: number, tile: number) =>
    count === 1 ? 0 : Math.round((index * (total - tile)) / (count - 1));
  const regions: Region[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      regions.push({
        x: position(column, columns, width, tileWidth),
        y: position(row, rows, height, tileHeight),
        width: tileWidth,
        height: tileHeight,
      });
    }
  }
  return regions;
}

/** Cards below this confidence are ignored in table mode, where nothing says how many to expect. */
export const TABLE_MIN_CONFIDENCE = 0.25;

const centre = (d: Detection) => ({ x: (d.box[0] + d.box[2]) / 2, y: (d.box[1] + d.box[3]) / 2 });
const height = (d: Detection) => d.box[3] - d.box[1];

/**
 * Turns raw corner detections into one positioned card per code. A card shows
 * its index in two opposite corners; when both are seen the midpoint is the
 * card centre, otherwise the single corner is used.
 */
export function positionedCards(detections: Detection[], minConfidence = TABLE_MIN_CONFIDENCE): PositionedCard[] {
  const unique = nonMaxSuppression(detections);
  const byCode = new Map<string, Detection[]>();
  for (const detection of unique) {
    if (detection.confidence < minConfidence) continue;
    byCode.set(detection.code, [...(byCode.get(detection.code) ?? []), detection]);
  }

  const cards: PositionedCard[] = [];
  for (const [code, list] of byCode) {
    const sorted = [...list].sort((a, b) => b.confidence - a.confidence);
    const best = sorted[0];
    const first = centre(best);
    const other = sorted.slice(1).find((candidate) => {
      const c = centre(candidate);
      return Math.hypot(c.x - first.x, c.y - first.y) > height(best);
    });
    const second = other ? centre(other) : null;
    cards.push({
      code,
      card: codeToCard(code),
      confidence: best.confidence,
      x: second ? (first.x + second.x) / 2 : first.x,
      y: second ? (first.y + second.y) / 2 : first.y,
      size: height(best),
    });
  }
  return cards;
}

export interface TableOutcome {
  cards: PositionedCard[];
  passes: number;
}

/** A whole-table photo needs at least a 5-card board and one 2-card hand. */
const MIN_TABLE_CARDS = 7;

export async function detectTable(
  run: PassRunner,
  width: number,
  height: number,
  onProgress?: ProgressListener,
): Promise<TableOutcome> {
  const regions: Region[] = [{ x: 0, y: 0, width, height }, ...gridRegions(width, height, 3, 3, 0.5)];
  const variants: Variant[][] = [['plain'], ['sharp3']];

  let all: Detection[] = [];
  let passes = 0;
  let cards: PositionedCard[] = [];
  for (const [round, roundVariants] of variants.entries()) {
    for (const variant of roundVariants) {
      for (const [index, region] of regions.entries()) {
        onProgress?.(`Scanning the table… ${index + 1}/${regions.length}${round ? ' (enhanced)' : ''}`);
        all = all.concat(nonMaxSuppression(await run(region, variant)));
        passes += 1;
      }
    }
    cards = positionedCards(all);
    if (cards.length >= MIN_TABLE_CARDS) break;
  }
  return { cards, passes };
}
