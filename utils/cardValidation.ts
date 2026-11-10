import { Card, Player } from '@/types/poker';

export const cardKey = (card: Card) => `${card.rank}-${card.suit}`;

export function findDuplicateCards(community: Card[], players: Player[]): string[] {
  const keys = [...community, ...players.flatMap((player) => player.cards)].map(cardKey);
  return [...new Set(keys.filter((key, index) => keys.indexOf(key) !== index))];
}

export function validateGame(community: Card[], players: Player[]): string | null {
  if (community.length !== 5) return 'Add exactly five community cards.';
  if (players.length < 1) return 'Add at least one player.';
  const incomplete = players.find((player) => player.cards.length !== 2);
  if (incomplete) return `${incomplete.name} needs exactly two cards.`;
  const duplicates = findDuplicateCards(community, players);
  if (duplicates.length) return 'A card cannot appear more than once in a game.';
  return null;
}
