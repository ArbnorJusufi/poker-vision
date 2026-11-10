import { Card } from '@/types/poker';
import { cardKey } from '@/utils/cardValidation';

export interface Agreement {
  agree: boolean;
  summary: string;
}

const names = (cards: Card[]) => cards.map((card) => `${card.rank}${{ hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' }[card.suit]}`).join(' ');

/** Compares the on-device reading of one group of cards with the AI's, ignoring order. */
export function compareGroup(current: Card[], ai: Card[]): Agreement {
  const mine = new Set(current.map(cardKey));
  const theirs = new Set(ai.map(cardKey));
  const same = mine.size === theirs.size && [...mine].every((key) => theirs.has(key));
  if (same && mine.size > 0) return { agree: true, summary: 'AI agrees with the reading.' };
  if (!ai.length) return { agree: false, summary: 'AI could not read any cards.' };
  return { agree: false, summary: `AI reads ${names(ai)}.` };
}

export interface TableAgreement {
  agreeing: number;
  total: number;
  summary: string;
  agree: boolean;
}

/**
 * The first group is the board; the rest are hands. Hands are matched without regard to order, since
 * neither reading knows which player a photo's author would call first.
 */
export function compareTable(current: Card[][], ai: Card[][]): TableAgreement {
  const [myBoard = [], ...myHands] = current;
  const [aiBoard = [], ...aiHands] = ai;
  const handKey = (hand: Card[]) => hand.map(cardKey).sort().join('+');
  const available = aiHands.map(handKey);
  let agreeing = compareGroup(myBoard, aiBoard).agree ? 1 : 0;
  for (const hand of myHands) {
    const at = available.indexOf(handKey(hand));
    if (at >= 0 && hand.length > 0) {
      available.splice(at, 1);
      agreeing += 1;
    }
  }
  const total = 1 + Math.max(myHands.length, aiHands.length);
  const agree = agreeing === total;
  return {
    agreeing,
    total,
    agree,
    summary: agree ? 'AI agrees with every group.' : `AI agrees with ${agreeing} of ${total} groups.`,
  };
}

/** The AI's groups only replace the reading when the board has 5 cards, every hand 2, and no card repeats. */
export function usableTable(ai: Card[][]): boolean {
  if (ai.length < 2) return false;
  if (ai[0].length !== 5 || ai.slice(1).some((hand) => hand.length !== 2)) return false;
  const keys = ai.flat().map(cardKey);
  return new Set(keys).size === keys.length;
}
