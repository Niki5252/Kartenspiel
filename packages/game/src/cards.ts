/**
 * Karten-Grundtypen und Hilfsfunktionen.
 * Normales französisches 52-Karten-Deck, keine Joker. Ass zählt als 1.
 */

export type Suit = 'clubs' | 'diamonds' | 'hearts' | 'spades';

/** 1 = Ass, 2..10 = Zahlen, 11 = Bube, 12 = Dame, 13 = König */
export type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;

/** Kompakte, stabile Karten-ID, z. B. "C2" (Kreuz 2), "D10" (Karo 10), "HQ" (Herz Dame). */
export type CardId = string;

export interface Card {
  readonly id: CardId;
  readonly suit: Suit;
  readonly rank: Rank;
}

/** Feste Farbreihenfolge (auch für die Tischsortierung): Kreuz, Karo, Herz, Pik. */
export const SUITS: readonly Suit[] = ['clubs', 'diamonds', 'hearts', 'spades'];

export const RANKS: readonly Rank[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

export const JACK: Rank = 11;
export const QUEEN: Rank = 12;
export const KING: Rank = 13;

const SUIT_LETTER: Record<Suit, string> = { clubs: 'C', diamonds: 'D', hearts: 'H', spades: 'S' };
const LETTER_SUIT: Record<string, Suit> = { C: 'clubs', D: 'diamonds', H: 'hearts', S: 'spades' };
const RANK_CODE: Record<Rank, string> = {
  1: 'A', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10', 11: 'J', 12: 'Q', 13: 'K',
};

export function cardId(suit: Suit, rank: Rank): CardId {
  return `${SUIT_LETTER[suit]}${RANK_CODE[rank]}`;
}

export function makeCard(suit: Suit, rank: Rank): Card {
  return { id: cardId(suit, rank), suit, rank };
}

export function parseCardId(id: CardId): Card | null {
  const suit = LETTER_SUIT[id.charAt(0)];
  const code = id.slice(1);
  const rank = RANKS.find((r) => RANK_CODE[r] === code);
  if (!suit || rank === undefined) return null;
  return makeCard(suit, rank);
}

/** Zahlenkarten (Ass..10) haben einen Zählwert für die 11er-Aufnahme. */
export function isNumberCard(card: Card): boolean {
  return card.rank <= 10;
}

export function isJack(card: Card): boolean {
  return card.rank === JACK;
}

export function isClubTwo(card: Card): boolean {
  return card.suit === 'clubs' && card.rank === 2;
}

export function isDiamondTen(card: Card): boolean {
  return card.suit === 'diamonds' && card.rank === 10;
}

/** Wertvolle Sonderkarten (je 1 Punkt): Kreuz 2 und Karo 10. */
export function isSpecialCard(card: Card): boolean {
  return isClubTwo(card) || isDiamondTen(card);
}

/** Sichtbare Kurzbezeichnungen (international üblich): Bube = J, Dame = Q, König = K. Nur Darstellung. */
export const RANK_LABEL: Record<Rank, string> = {
  1: 'A', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10', 11: 'J', 12: 'Q', 13: 'K',
};

export const RANK_NAME_DE: Record<Rank, string> = {
  1: 'Ass', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10', 11: 'Bube', 12: 'Dame', 13: 'König',
};

export const SUIT_NAME_DE: Record<Suit, string> = {
  clubs: 'Kreuz', diamonds: 'Karo', hearts: 'Herz', spades: 'Pik',
};

export const SUIT_SYMBOL: Record<Suit, string> = {
  clubs: '♣', diamonds: '♦', hearts: '♥', spades: '♠',
};

export function isRedSuit(suit: Suit): boolean {
  return suit === 'hearts' || suit === 'diamonds';
}

export function cardLabel(card: Card): string {
  return `${SUIT_NAME_DE[card.suit]} ${RANK_NAME_DE[card.rank]}`;
}

/**
 * Tischsortierung: primär nach Wert (A..10, B, D, K), innerhalb desselben Werts
 * feste Farbreihenfolge Kreuz, Karo, Herz, Pik.
 */
export function compareTableOrder(a: Card, b: Card): number {
  if (a.rank !== b.rank) return a.rank - b.rank;
  return SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit);
}

export function sortTable(cards: readonly Card[]): Card[] {
  return [...cards].sort(compareTableOrder);
}
