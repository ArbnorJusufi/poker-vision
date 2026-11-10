export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'] as const;
export const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'] as const;

export type Rank = (typeof RANKS)[number];
export type Suit = (typeof SUITS)[number];

export interface Card {
  rank: Rank;
  suit: Suit;
}

export interface Player {
  id: string;
  name: string;
  cards: Card[];
}

export type HandCategory =
  | 'High Card'
  | 'One Pair'
  | 'Two Pair'
  | 'Three of a Kind'
  | 'Straight'
  | 'Flush'
  | 'Full House'
  | 'Four of a Kind'
  | 'Straight Flush'
  | 'Royal Flush';

export interface EvaluatedHand {
  category: HandCategory;
  categoryValue: number;
  tiebreakers: number[];
  cards: Card[];
}

export interface PlayerResult {
  player: Player;
  hand: EvaluatedHand;
  isWinner: boolean;
  percentage: number;
}

export interface RecognitionResult {
  cards: Card[];
  /** Per-card confidence (0-1), parallel to `cards`. */
  confidences?: number[];
  /** Lowest per-card confidence. */
  confidence?: number;
  source: 'model' | 'manual';
  message?: string;
}

export interface PositionedCard {
  code: string;
  card: Card;
  confidence: number;
  /** Estimated card centre in source-image pixels. */
  x: number;
  y: number;
  /** Typical height of the card's corner index in pixels; a scale reference. */
  size: number;
}

export interface TableDetection {
  imageWidth: number;
  imageHeight: number;
  cards: PositionedCard[];
  message?: string;
}

export interface TableLayout {
  ok: boolean;
  message?: string;
  community: PositionedCard[];
  /** One entry per player, ordered clockwise starting from the top. */
  players: PositionedCard[][];
  /** Detected cards ignored as likely false positives. */
  dropped: PositionedCard[];
}
