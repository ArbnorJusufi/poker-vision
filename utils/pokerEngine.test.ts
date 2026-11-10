import { describe, expect, it } from 'vitest';
import { Card, Player, Rank, Suit } from '@/types/poker';
import { calculateResults, evaluateBestHand } from './pokerEngine';
import { findDuplicateCards, validateGame } from './cardValidation';
import { CardRecognitionService } from '@/services/CardRecognitionService';

const suitMap: Record<string, Suit> = { h: 'hearts', d: 'diamonds', c: 'clubs', s: 'spades' };
const cards = (value: string): Card[] => value.split(' ').map((token) => ({
  rank: token.slice(0, -1) as Rank,
  suit: suitMap[token.slice(-1)],
}));

describe('Texas Hold’em hand evaluation', () => {
  it.each([
    ['Royal Flush', 'Ah Kh Qh Jh 10h 2c 3d'],
    ['Straight Flush', '9s 8s 7s 6s 5s Ah Kd'],
    ['Four of a Kind', 'Ac Ad Ah As 9c 2d 3h'],
    ['Full House', 'Kc Kd Kh 9s 9d 2c 3h'],
    ['Flush', 'Ah Jh 8h 4h 2h Kc Qd'],
    ['Straight', '9h 8d 7s 6c 5h Ac Kd'],
    ['Three of a Kind', 'Qc Qd Qs 9h 6c 3d 2s'],
    ['Two Pair', 'Jh Jd 8s 8c Ah 3d 2s'],
    ['One Pair', '10h 10d As 8c 6h 3d 2s'],
    ['High Card', 'Ah Jd 9s 7c 5h 3d 2s'],
  ])('identifies %s', (category, input) => {
    expect(evaluateBestHand(cards(input)).category).toBe(category);
  });

  it('handles the ace-low straight', () => {
    expect(evaluateBestHand(cards('Ah 2d 3s 4c 5h Kd Qs')).category).toBe('Straight');
  });

  it('uses kickers to break equal pairs', () => {
    const community = cards('Ah Ad 7s 4c 2h');
    const players: Player[] = [
      { id: '1', name: 'One', cards: cards('Kh Qh') },
      { id: '2', name: 'Two', cards: cards('Jh 10h') },
    ];
    expect(calculateResults(community, players).map((result) => result.percentage)).toEqual([100, 0]);
  });

  it('splits the pot across tied winners and totals 100%', () => {
    const community = cards('Ah Kh Qh Jh 10h');
    const players: Player[] = [
      { id: '1', name: 'One', cards: cards('2c 3d') },
      { id: '2', name: 'Two', cards: cards('4c 5d') },
      { id: '3', name: 'Three', cards: cards('6c 7d') },
    ];
    const results = calculateResults(community, players);
    expect(results.reduce((sum, result) => sum + result.percentage, 0)).toBeCloseTo(100);
    expect(results.every((result) => result.isWinner)).toBe(true);
  });
});

describe('game validation and recognition fallback', () => {
  it('detects duplicate cards across board and players', () => {
    const community = cards('Ah Kh Qh Jh 10h');
    const players: Player[] = [{ id: '1', name: 'One', cards: cards('Ah 2c') }];
    expect(findDuplicateCards(community, players)).toEqual(['A-hearts']);
    expect(validateGame(community, players)).toContain('cannot appear more than once');
  });

  it('rejects incomplete players', () => {
    expect(validateGame(cards('Ah Kh Qh Jh 10h'), [{ id: '1', name: 'One', cards: cards('2c') }]))
      .toContain('needs exactly two cards');
  });

  it('returns an honest manual fallback when no model is installed', async () => {
    const result = await CardRecognitionService.recognize('file://photo.jpg', 5);
    expect(result.source).toBe('manual');
    expect(result.cards).toHaveLength(0);
  });
});
