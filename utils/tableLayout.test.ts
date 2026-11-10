import { describe, expect, it } from 'vitest';
import { PositionedCard } from '@/types/poker';
import { codeToCard } from '@/services/recognition/yolo';
import { groupTable, lowConfidenceCards } from './tableLayout';

const card = (code: string, x: number, y: number, confidence = 0.8, size = 28): PositionedCard => ({
  code, card: codeToCard(code), confidence, x, y, size,
});
const codes = (cards: PositionedCard[]) => cards.map((c) => c.code);

// Positions measured from real detections on a rendered 2-player Hold'em layout.
const layout2 = [
  card('JH', 929, 231), card('KH', 1029, 521), card('AH', 676, 522), card('AS', 576, 556),
  card('AD', 676, 273), card('2C', 776, 556), card('AC', 575, 273), card('10H', 864, 478, 0.71), card('QH', 1030, 231, 0.36),
];

// Positions measured from a real photo (3 face-down cards were not detected).
const photo2 = [
  card('8C', 1445, 262, 0.91, 37), card('JD', 466, 224, 0.87, 42), card('KC', 954, 511, 0.86, 47),
  card('5S', 654, 446, 0.86, 45), card('4H', 1099, 464, 0.84, 44), card('3H', 250, 200, 0.82, 46),
  card('7D', 1248, 461, 0.77, 46), card('6H', 1300, 155, 0.74, 41), card('AS', 809, 507, 0.66, 45),
];

describe('groupTable', () => {
  it('splits a rendered 2-player layout into board and hands', () => {
    const layout = groupTable(layout2);
    expect(layout.ok).toBe(true);
    expect(codes(layout.community).sort()).toEqual(['10H', '2C', 'AH', 'AS', 'KH']);
    const hands = layout.players.map((hand) => codes(hand).sort().join(' ')).sort();
    expect(hands).toEqual(['AC AD', 'JH QH']);
    expect(layout.dropped).toEqual([]);
  });

  it('splits a real photo layout', () => {
    const layout = groupTable(photo2);
    expect(codes(layout.community).sort()).toEqual(['4H', '5S', '7D', 'AS', 'KC']);
    expect(layout.players.map((hand) => codes(hand).sort().join(' ')).sort()).toEqual(['3H JD', '6H 8C']);
  });

  it('orders the board left to right and players clockwise from the top', () => {
    const layout = groupTable(photo2);
    expect(codes(layout.community)).toEqual(['5S', 'AS', 'KC', '4H', '7D']);
    expect(codes(layout.players[0])).toEqual(['6H', '8C']);
    expect(codes(layout.players[1])).toEqual(['3H', 'JD']);
  });

  it('drops an isolated false positive when the count is even', () => {
    const layout = groupTable([...photo2, card('6S', 1700, 800, 0.6, 40)]);
    expect(layout.ok).toBe(true);
    expect(layout.dropped.map((c) => c.code)).toEqual(['6S']);
    expect(layout.community).toHaveLength(5);
    expect(layout.players).toHaveLength(2);
    expect(layout.message).toContain('6S');
  });

  it('fails clearly when there are too few cards', () => {
    const layout = groupTable(photo2.slice(0, 6));
    expect(layout.ok).toBe(false);
    expect(layout.message).toContain('at least 7');
  });

  it('handles a 6-player table with the heuristic search', () => {
    const board = ['2C', '5D', '9H', 'JS', 'KD'].map((code, i) => card(code, 800 + i * 80, 500));
    const seats: [number, number][] = [[200, 150], [800, 100], [1500, 150], [1600, 800], [800, 950], [150, 850], [200, 500], [1550, 500]];
    const hands = seats.map(([x, y], i) => [
      card(['AS', 'KS', 'QS', 'JD', '10D', '9D', '8D', '7D'][i], x, y),
      card(['AH', 'KH', 'QH', 'JC', '10C', '9C', '8C', '7C'][i], x + 60, y + 10),
    ]);
    const layout = groupTable([...board, ...hands.flat()]);
    expect(layout.ok).toBe(true);
    expect(codes(layout.community)).toEqual(['2C', '5D', '9H', 'JS', 'KD']);
    expect(layout.players).toHaveLength(8);
    const found = layout.players.map((hand) => codes(hand).sort().join(' ')).sort();
    const expected = hands.map((hand) => codes(hand).sort().join(' ')).sort();
    expect(found).toEqual(expected);
  });
});

describe('lowConfidenceCards', () => {
  it('flags used cards below the threshold and ignores dropped or failed layouts', () => {
    const weak = photo2.map((c) => (c.code === 'AS' ? { ...c, confidence: 0.4 } : c));
    const layout = groupTable(weak);
    expect(lowConfidenceCards(layout).map((c) => c.code)).toEqual(['AS']);
    expect(lowConfidenceCards(groupTable(photo2.slice(0, 3)))).toEqual([]);
    const withStray = groupTable([...photo2, card('6S', 1700, 800, 0.2, 40)]);
    expect(lowConfidenceCards(withStray)).toEqual([]);
  });
});
