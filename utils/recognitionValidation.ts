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

/** Cards from a partial or conflicting recognition that are safe to pre-fill. */
export function usableRecognizedCards(cards: Card[], expectedCount: number, blocked: Card[]): Card[] {
  const taken = new Set(blocked.map(cardKey));
  const usable: Card[] = [];
  for (const card of cards) {
    const key = cardKey(card);
    if (taken.has(key)) continue;
    taken.add(key);
    usable.push(card);
  }
  return usable.slice(0, expectedCount);
}

export const LOW_CONFIDENCE = 0.6;

export function describeConfidence(confidence?: number): string {
  if (confidence === undefined) return 'Cards detected.';
  const percent = Math.round(confidence * 100);
  return confidence < LOW_CONFIDENCE
    ? `Cards detected, but the weakest match is only ${percent}%. Please check them.`
    : `Cards detected (weakest match ${percent}%).`;
}
