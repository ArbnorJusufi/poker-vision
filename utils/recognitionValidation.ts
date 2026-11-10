import { Card } from '@/types/poker';
import { cardKey } from './cardValidation';

export function validateRecognizedCards(cards: Card[], expectedCount: number, blocked: Card[]): string | null {
  if (cards.length !== expectedCount) {
    return `Expected ${expectedCount} cards but recognized ${cards.length}.`;
  }
  const keys = cards.map(cardKey);
  if (new Set(keys).size !== keys.length) return 'The same card was recognized more than once.';
  const blockedKeys = new Set(blocked.map(cardKey));
  if (keys.some((key) => blockedKeys.has(key))) return 'A recognized card is already used elsewhere in this game.';
  return null;
}
