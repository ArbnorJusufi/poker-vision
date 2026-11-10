import { PositionedCard, TableLayout } from '@/types/poker';

const BOARD_SIZE = 5;
const HAND_SIZE = 2;
/** Above this many cards the exact search is too slow, so a nearest-neighbour heuristic is used. */
const EXACT_LIMIT = 17;
/** How much a card's confidence resists being dropped as a false positive, in card-size units. */
const CONFIDENCE_WEIGHT = 4;

type Distances = number[][];

function distanceMatrix(cards: PositionedCard[]): Distances {
  return cards.map((a) => cards.map((b) => Math.hypot(a.x - b.x, a.y - b.y)));
}

/** Total length of the minimum spanning tree over the cards in `members`. */
function spanningLength(members: number[], d: Distances): number {
  const inTree = new Set<number>([members[0]]);
  let total = 0;
  while (inTree.size < members.length) {
    let best = Infinity;
    let pick = -1;
    for (const a of inTree) {
      for (const b of members) {
        if (!inTree.has(b) && d[a][b] < best) {
          best = d[a][b];
          pick = b;
        }
      }
    }
    inTree.add(pick);
    total += best;
  }
  return total;
}

interface Partition {
  cost: number;
  board: number[];
  hands: number[][];
}

function exactPairing(mask: number, d: Distances, memo: Map<number, { cost: number; pairs: number[][] }>) {
  const cached = memo.get(mask);
  if (cached) return cached;
  if (mask === 0) return { cost: 0, pairs: [] as number[][] };
  const first = 31 - Math.clz32(mask & -mask);
  let best = { cost: Infinity, pairs: [] as number[][] };
  for (let j = first + 1; j < d.length; j += 1) {
    if (!(mask & (1 << j))) continue;
    const rest = exactPairing(mask & ~(1 << first) & ~(1 << j), d, memo);
    const cost = d[first][j] + rest.cost;
    if (cost < best.cost) best = { cost, pairs: [[first, j], ...rest.pairs] };
  }
  memo.set(mask, best);
  return best;
}

function greedyPairing(indices: number[], d: Distances): { cost: number; pairs: number[][] } {
  const free = new Set(indices);
  const pairs: number[][] = [];
  let cost = 0;
  while (free.size > 1) {
    let best = Infinity;
    let pair: [number, number] = [-1, -1];
    for (const a of free) {
      for (const b of free) {
        if (a < b && d[a][b] < best) {
          best = d[a][b];
          pair = [a, b];
        }
      }
    }
    free.delete(pair[0]);
    free.delete(pair[1]);
    pairs.push(pair);
    cost += best;
  }
  return { cost, pairs };
}

function bestPartitionExact(d: Distances): Partition {
  const n = d.length;
  const full = (1 << n) - 1;
  const memo = new Map<number, { cost: number; pairs: number[][] }>();
  let best: Partition = { cost: Infinity, board: [], hands: [] };

  const choose = (start: number, picked: number[], mask: number) => {
    if (picked.length === BOARD_SIZE) {
      const boardCost = spanningLength(picked, d);
      if (boardCost >= best.cost) return;
      const rest = exactPairing(full & ~mask, d, memo);
      if (boardCost + rest.cost < best.cost) best = { cost: boardCost + rest.cost, board: [...picked], hands: rest.pairs };
      return;
    }
    for (let i = start; i <= n - (BOARD_SIZE - picked.length); i += 1) {
      choose(i + 1, [...picked, i], mask | (1 << i));
    }
  };
  choose(0, [], 0);
  return best;
}

function bestPartitionHeuristic(d: Distances): Partition {
  const n = d.length;
  let best: Partition = { cost: Infinity, board: [], hands: [] };
  for (let seed = 0; seed < n; seed += 1) {
    const nearest = [...Array(n).keys()].sort((a, b) => d[seed][a] - d[seed][b]).slice(0, BOARD_SIZE);
    const rest = [...Array(n).keys()].filter((i) => !nearest.includes(i));
    const pairing = greedyPairing(rest, d);
    const cost = spanningLength(nearest, d) + pairing.cost;
    if (cost < best.cost) best = { cost, board: nearest, hands: pairing.pairs };
  }
  return best;
}

function partition(cards: PositionedCard[]): Partition {
  const d = distanceMatrix(cards);
  return cards.length <= EXACT_LIMIT ? bestPartitionExact(d) : bestPartitionHeuristic(d);
}

function medianSize(cards: PositionedCard[]): number {
  const sizes = cards.map((card) => card.size).sort((a, b) => a - b);
  return sizes[Math.floor(sizes.length / 2)] || 1;
}

/** Orders hands clockwise around the board, starting from the top of the picture. */
function orderClockwise(hands: PositionedCard[][], board: PositionedCard[]): PositionedCard[][] {
  const cx = board.reduce((sum, card) => sum + card.x, 0) / board.length;
  const cy = board.reduce((sum, card) => sum + card.y, 0) / board.length;
  const angle = (hand: PositionedCard[]) => {
    const x = hand.reduce((sum, card) => sum + card.x, 0) / hand.length - cx;
    const y = hand.reduce((sum, card) => sum + card.y, 0) / hand.length - cy;
    return (Math.atan2(x, -y) + 2 * Math.PI) % (2 * Math.PI);
  };
  return [...hands].sort((a, b) => angle(a) - angle(b));
}

const byX = (a: PositionedCard, b: PositionedCard) => a.x - b.x;

/**
 * Splits the cards seen in a table photo into one 5-card board and several
 * 2-card hands by choosing the grouping that keeps each group's cards closest
 * together. When an even number of cards is found, the card whose removal
 * tightens the layout most (weighted by confidence) is dropped as a false
 * positive.
 */
export function groupTable(cards: PositionedCard[]): TableLayout {
  const empty: TableLayout = { ok: false, community: [], players: [], dropped: [] };
  const minimum = BOARD_SIZE + HAND_SIZE;
  if (cards.length < minimum) {
    return {
      ...empty,
      message: `Found ${cards.length} cards, but a table needs at least ${minimum} (5 on the board and 2 for a player).`,
    };
  }

  let used = cards;
  let dropped: PositionedCard[] = [];
  if ((cards.length - BOARD_SIZE) % HAND_SIZE !== 0) {
    if (cards.length - 1 < minimum) {
      return { ...empty, message: `Found ${cards.length} cards, which does not fit a 5-card board plus 2-card hands.` };
    }
    const unit = medianSize(cards);
    let bestScore = Infinity;
    let bestIndex = 0;
    cards.forEach((card, index) => {
      const remaining = cards.filter((_, i) => i !== index);
      const score = partition(remaining).cost / unit + CONFIDENCE_WEIGHT * card.confidence;
      if (score < bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    });
    dropped = [cards[bestIndex]];
    used = cards.filter((_, i) => i !== bestIndex);
  }

  const result = partition(used);
  const board = result.board.map((i) => used[i]).sort(byX);
  const hands = result.hands.map((pair) => pair.map((i) => used[i]).sort(byX));
  return {
    ok: true,
    community: board,
    players: orderClockwise(hands, board),
    dropped,
    message: dropped.length
      ? `Ignored ${dropped[0].code}: it looked like a stray detection. Check the cards below.`
      : undefined,
  };
}

/** Confidence below which a card in a table scan is flagged for a quick visual check. */
export const TABLE_REVIEW_CONFIDENCE = 0.5;

/** Cards the scan used that were read with low confidence. */
export function lowConfidenceCards(layout: TableLayout, threshold = TABLE_REVIEW_CONFIDENCE): PositionedCard[] {
  if (!layout.ok) return [];
  return [...layout.community, ...layout.players.flat()].filter((card) => card.confidence < threshold);
}
