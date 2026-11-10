import { Card, RANKS, Rank, SUITS, Suit } from '@/types/poker';
import { AiRequest } from './types';

const SUIT_BY_LETTER: Record<string, Suit> = { S: 'spades', H: 'hearts', D: 'diamonds', C: 'clubs' };
const SUIT_BY_SYMBOL: Record<string, Suit> = { '♠': 'spades', '♥': 'hearts', '♦': 'diamonds', '♣': 'clubs' };
const RANK_WORDS: Record<string, Rank> = {
  ACE: 'A', KING: 'K', QUEEN: 'Q', JACK: 'J', TEN: '10', NINE: '9', EIGHT: '8',
  SEVEN: '7', SIX: '6', FIVE: '5', FOUR: '4', THREE: '3', TWO: '2',
};

function toRank(text: string): Rank | null {
  const value = text.trim().toUpperCase();
  if (value === 'T') return '10';
  if (value in RANK_WORDS) return RANK_WORDS[value];
  return (RANKS as readonly string[]).includes(value) ? (value as Rank) : null;
}

function toSuit(text: string): Suit | null {
  const value = text.trim();
  if (value in SUIT_BY_SYMBOL) return SUIT_BY_SYMBOL[value];
  const upper = value.toUpperCase();
  if (upper in SUIT_BY_LETTER) return SUIT_BY_LETTER[upper];
  const lower = value.toLowerCase();
  return SUITS.find((suit) => suit === lower || suit === `${lower}s`) ?? null;
}

/** Accepts "AS", "10h", "Td", "A♠" and "ten of hearts". */
export function parseCardText(value: unknown): Card | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  const spoken = text.match(/^(\w+)\s+of\s+(\w+)$/i);
  if (spoken) {
    const rank = toRank(spoken[1]);
    const suit = toSuit(spoken[2]);
    return rank && suit ? { rank, suit } : null;
  }
  const compact = text.replace(/\s+/g, '');
  if (compact.length < 2) return null;
  const rank = toRank(compact.slice(0, -1));
  const suit = toSuit(compact.slice(-1));
  return rank && suit ? { rank, suit } : null;
}

export interface AiReading {
  /** The five board cards, or the cards of a single hand when scanning a fixed number of cards. */
  cards: Card[];
  /** Hole cards of each player, in clockwise order from the top of the photo. Table scans only. */
  players: Card[][];
  /** Cards the model said it could not read. */
  unreadable: number;
}

function lenientJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('The AI did not return a card list.');
  return JSON.parse(text.slice(start, end + 1));
}

function cardList(value: unknown): { cards: Card[]; unreadable: number } {
  if (!Array.isArray(value)) return { cards: [], unreadable: 0 };
  const cards: Card[] = [];
  let unreadable = 0;
  for (const item of value) {
    const card = parseCardText(item);
    if (card) cards.push(card);
    else unreadable += 1;
  }
  return { cards, unreadable };
}

export function parseAiReading(text: string, request: AiRequest): AiReading {
  let data: Record<string, unknown>;
  try {
    data = lenientJson(text) as Record<string, unknown>;
  } catch {
    throw new Error('The AI did not return a card list.');
  }
  if (request.kind === 'cards') {
    const read = cardList(data.cards);
    return { cards: read.cards, players: [], unreadable: read.unreadable };
  }
  const board = cardList(data.board);
  const players = (Array.isArray(data.players) ? data.players : []).map(cardList);
  return {
    cards: board.cards,
    players: players.map((player) => player.cards),
    unreadable: board.unreadable + players.reduce((total, player) => total + player.unreadable, 0),
  };
}

const CODE_HELP =
  'Write each card as rank then suit letter: rank is 2-10, J, Q, K or A; suit is S (spades), H (hearts), D (diamonds) or C (clubs). Examples: "AS", "10H", "7C".';

export function buildPrompt(request: AiRequest): string {
  if (request.kind === 'cards') {
    return [
      `This photo shows ${request.expected} playing card${request.expected === 1 ? '' : 's'}.`,
      'Read every card carefully, using both the rank and the suit symbol.',
      CODE_HELP,
      'Reply with JSON only, no other text: {"cards": ["AS", "10H"]}.',
      'Use null for a card you cannot read; never guess a card that is hidden.',
    ].join(' ');
  }
  return [
    "This photo (or illustration) shows a Texas Hold'em table: five community cards (the board) and the two private cards of each player.",
    'Read every visible card carefully, using both the rank and the suit symbol.',
    'List the players in clockwise order starting with the player closest to the top of the image.',
    CODE_HELP,
    'Reply with JSON only, no other text: {"board": ["AS", "10H", "5S", "9H", "9S"], "players": [["10C", "9C"], ["5H", "5D"]]}.',
    'Use null for a card you cannot read; never guess a card that is hidden.',
  ].join(' ');
}
