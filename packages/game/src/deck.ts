import { type Card, RANKS, SUITS, isJack, makeCard } from './cards';
import type { Rng } from './rng';

/**
 * Deck-Konvention in der gesamten Engine: Index 0 = oberste Karte, letzter Index = unterste Karte.
 * Ausgeteilt wird immer von oben.
 */
export type Deck = Card[];

export const DECK_SIZE = 52;

export function createDeck(): Deck {
  const deck: Deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) deck.push(makeCard(suit, rank));
  }
  return deck;
}

/** Vollständig zufälliges Mischen (Fisher-Yates). */
export function shuffleDeck(deck: readonly Card[], rng: Rng): Deck {
  const result = [...deck];
  for (let i = result.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    const tmp = result[i] as Card;
    result[i] = result[j] as Card;
    result[j] = tmp;
  }
  return result;
}

/**
 * Gültige Schnittstellen: Anzahl der oben abgehobenen Karten.
 * Beide Teilstapel müssen mindestens eine Karte enthalten.
 */
export function minCutIndex(): number {
  return 1;
}

export function maxCutIndex(deckSize: number): number {
  return deckSize - 1;
}

export function isValidCutIndex(index: number, deckSize: number): boolean {
  return Number.isInteger(index) && index >= minCutIndex() && index <= maxCutIndex(deckSize);
}

export function randomCutIndex(deckSize: number, rng: Rng): number {
  const min = minCutIndex();
  return min + rng.int(maxCutIndex(deckSize) - min + 1);
}

export interface CutResult {
  deck: Deck;
  /** Unterste Karte des abgehobenen (oberen) Stapels – wird allen offen gezeigt und ist danach die unterste Karte des Decks. */
  revealedCard: Card;
}

/**
 * Schneiden: Die oberen `index` Karten werden abgehoben, deren unterste Karte wird gezeigt,
 * danach kommt der abgehobene Stapel unter den ursprünglich unteren Stapel.
 */
export function cutDeck(deck: readonly Card[], index: number): CutResult {
  if (!isValidCutIndex(index, deck.length)) {
    throw new Error(`cutDeck: ungültige Schnittstelle ${index}`);
  }
  const top = deck.slice(0, index);
  const bottom = deck.slice(index);
  return { deck: [...bottom, ...top], revealedCard: top[top.length - 1] as Card };
}

export interface DrawResult {
  cards: Card[];
  deck: Deck;
}

/** Nimmt ein Paket von `count` Karten von oben. */
export function drawPacket(deck: readonly Card[], count: number): DrawResult {
  if (deck.length < count) throw new Error(`drawPacket: nur ${deck.length} Karten im Deck`);
  return { cards: deck.slice(0, count), deck: deck.slice(count) };
}

export interface TableRevealResult {
  table: Card[];
  deck: Deck;
  /** Buben, die beim Aufdecken unter das Deck geschoben wurden (in dieser Reihenfolge). */
  movedJacks: Card[];
}

/**
 * Erstes Aufdecken der Tischkarten mit Buben-Sonderregel:
 * Ein aufgedeckter Bube kommt ganz unten unter das verbleibende Deck, es wird eine Ersatzkarte aufgedeckt.
 */
export function revealInitialTable(deck: readonly Card[], count = 4): TableRevealResult {
  const remaining = [...deck];
  const table: Card[] = [];
  const movedJacks: Card[] = [];
  // Schutz gegen Endlosschleifen (nur theoretisch möglich, wenn fast nur Buben übrig wären).
  let guard = remaining.length;
  while (table.length < count) {
    if (guard-- <= 0 || remaining.length === 0) {
      throw new Error('revealInitialTable: nicht genug gültige Karten');
    }
    const card = remaining.shift() as Card;
    if (isJack(card)) {
      remaining.push(card);
      movedJacks.push(card);
    } else {
      table.push(card);
    }
  }
  return { table, deck: remaining, movedJacks };
}
