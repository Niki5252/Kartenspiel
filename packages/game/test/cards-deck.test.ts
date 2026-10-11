import { describe, expect, it } from 'vitest';
import {
  DECK_SIZE,
  createDeck,
  createSeededRng,
  cutDeck,
  isValidCutIndex,
  parseCardId,
  randomCutIndex,
  revealInitialTable,
  shuffleDeck,
  sortTable,
} from '../src';
import { cards, ids } from './helpers';

describe('Deck', () => {
  it('hat 52 eindeutige Karten ohne Joker', () => {
    const deck = createDeck();
    expect(deck).toHaveLength(DECK_SIZE);
    expect(new Set(ids(deck)).size).toBe(52);
  });

  it('Mischen behält alle Karten und ist mit Seed reproduzierbar', () => {
    const a = shuffleDeck(createDeck(), createSeededRng(42));
    const b = shuffleDeck(createDeck(), createSeededRng(42));
    expect(ids(a)).toEqual(ids(b));
    expect([...ids(a)].sort()).toEqual([...ids(createDeck())].sort());
    expect(ids(a)).not.toEqual(ids(createDeck()));
  });

  it('Karten-IDs sind umkehrbar', () => {
    for (const c of createDeck()) expect(parseCardId(c.id)).toEqual(c);
    expect(parseCardId('X9')).toBeNull();
  });
});

describe('Schneiden', () => {
  it('zeigt die unterste Karte des abgehobenen Stapels, die danach ganz unten liegt', () => {
    const deck = cards('CA C2 C3 C4 C5 C6');
    const { deck: result, revealedCard } = cutDeck(deck, 2);
    expect(revealedCard.id).toBe('C2');
    expect(ids(result)).toEqual(['C3', 'C4', 'C5', 'C6', 'CA', 'C2']);
    expect(result[result.length - 1]?.id).toBe('C2');
  });

  it('validiert Schnittstellen und wählt zufällig nur gültige', () => {
    expect(isValidCutIndex(0, 52)).toBe(false);
    expect(isValidCutIndex(52, 52)).toBe(false);
    expect(isValidCutIndex(1, 52)).toBe(true);
    expect(isValidCutIndex(51, 52)).toBe(true);
    const rng = createSeededRng(1);
    for (let i = 0; i < 500; i++) expect(isValidCutIndex(randomCutIndex(52, rng), 52)).toBe(true);
  });
});

describe('Erstes Tisch-Aufdecken (Buben-Regel)', () => {
  it('schiebt Buben unter das Deck und deckt Ersatzkarten auf', () => {
    const deck = cards('C5 HJ D7 SJ C9 H3 D4 S8');
    const r = revealInitialTable(deck);
    expect(ids(r.table)).toEqual(['C5', 'D7', 'C9', 'H3']);
    expect(ids(r.movedJacks)).toEqual(['HJ', 'SJ']);
    expect(ids(r.deck)).toEqual(['D4', 'S8', 'HJ', 'SJ']);
  });

  it('ohne Buben werden einfach die oberen vier Karten aufgedeckt', () => {
    const r = revealInitialTable(cards('C5 D7 C9 H3 D4'));
    expect(ids(r.table)).toEqual(['C5', 'D7', 'C9', 'H3']);
    expect(r.movedJacks).toEqual([]);
  });
});

describe('Tischsortierung', () => {
  it('sortiert primär nach Wert, dann Kreuz, Karo, Herz, Pik', () => {
    const sorted = sortTable(cards('SK HQ C7 SA DQ C3 HA'));
    expect(ids(sorted)).toEqual(['HA', 'SA', 'C3', 'C7', 'DQ', 'HQ', 'SK']);
  });
});
