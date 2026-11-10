import { Card, EvaluatedHand, HandCategory, Player, PlayerResult } from '@/types/poker';

const rankValue: Record<Card['rank'], number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8,
  '9': 9, '10': 10, J: 11, Q: 12, K: 13, A: 14,
};

const categoryNames: HandCategory[] = [
  'High Card', 'One Pair', 'Two Pair', 'Three of a Kind', 'Straight',
  'Flush', 'Full House', 'Four of a Kind', 'Straight Flush',
];

function combinations<T>(items: T[], size: number): T[][] {
  if (size === 0) return [[]];
  if (items.length < size) return [];
  return items.flatMap((item, index) =>
    combinations(items.slice(index + 1), size - 1).map((rest) => [item, ...rest]),
  );
}

function evaluateFive(cards: Card[]): EvaluatedHand {
  const values = cards.map((card) => rankValue[card.rank]).sort((a, b) => b - a);
  const counts = new Map<number, number>();
  values.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const flush = cards.every((card) => card.suit === cards[0].suit);
  const unique = [...new Set(values)];
  let straightHigh = 0;
  if (unique.length === 5 && unique[0] - unique[4] === 4) straightHigh = unique[0];
  if (unique.join(',') === '14,5,4,3,2') straightHigh = 5;

  let categoryValue = 0;
  let tiebreakers = values;
  if (straightHigh && flush) {
    categoryValue = 8;
    tiebreakers = [straightHigh];
  } else if (groups[0][1] === 4) {
    categoryValue = 7;
    tiebreakers = [groups[0][0], groups[1][0]];
  } else if (groups[0][1] === 3 && groups[1][1] === 2) {
    categoryValue = 6;
    tiebreakers = [groups[0][0], groups[1][0]];
  } else if (flush) {
    categoryValue = 5;
  } else if (straightHigh) {
    categoryValue = 4;
    tiebreakers = [straightHigh];
  } else if (groups[0][1] === 3) {
    categoryValue = 3;
    tiebreakers = [groups[0][0], ...groups.slice(1).map(([value]) => value).sort((a, b) => b - a)];
  } else if (groups[0][1] === 2 && groups[1][1] === 2) {
    categoryValue = 2;
    const pairs = groups.slice(0, 2).map(([value]) => value).sort((a, b) => b - a);
    tiebreakers = [...pairs, groups[2][0]];
  } else if (groups[0][1] === 2) {
    categoryValue = 1;
    tiebreakers = [groups[0][0], ...groups.slice(1).map(([value]) => value).sort((a, b) => b - a)];
  }

  const category = categoryValue === 8 && straightHigh === 14
    ? 'Royal Flush'
    : categoryNames[categoryValue];
  return { category, categoryValue, tiebreakers, cards };
}

export function compareHands(a: EvaluatedHand, b: EvaluatedHand): number {
  if (a.categoryValue !== b.categoryValue) return a.categoryValue - b.categoryValue;
  const length = Math.max(a.tiebreakers.length, b.tiebreakers.length);
  for (let i = 0; i < length; i += 1) {
    if ((a.tiebreakers[i] ?? 0) !== (b.tiebreakers[i] ?? 0)) {
      return (a.tiebreakers[i] ?? 0) - (b.tiebreakers[i] ?? 0);
    }
  }
  return 0;
}

export function evaluateBestHand(cards: Card[]): EvaluatedHand {
  if (cards.length !== 7) throw new Error('Exactly seven cards are required.');
  return combinations(cards, 5)
    .map(evaluateFive)
    .reduce((best, hand) => (compareHands(hand, best) > 0 ? hand : best));
}

export function calculateResults(community: Card[], players: Player[]): PlayerResult[] {
  if (community.length !== 5) throw new Error('Five community cards are required.');
  if (!players.length || players.some((player) => player.cards.length !== 2)) {
    throw new Error('Every player must have two private cards.');
  }
  const evaluated = players.map((player) => ({ player, hand: evaluateBestHand([...community, ...player.cards]) }));
  const best = evaluated.reduce((current, result) =>
    compareHands(result.hand, current.hand) > 0 ? result : current,
  ).hand;
  const winnerCount = evaluated.filter((result) => compareHands(result.hand, best) === 0).length;
  return evaluated.map((result) => {
    const isWinner = compareHands(result.hand, best) === 0;
    return { ...result, isWinner, percentage: isWinner ? 100 / winnerCount : 0 };
  });
}
