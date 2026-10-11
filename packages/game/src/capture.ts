import { type Card, type CardId, KING, QUEEN, compareTableOrder, isJack, isNumberCard, isSpecialCard } from './cards';

/** Zielsumme für Zahlenkarten: gespielte Karte + aufgenommene Karten = 11. */
export const CAPTURE_SUM = 11;

/**
 * Eine legale Aufnahme: Liste von Tischkarten-IDs in sichtbarer Tischreihenfolge.
 * Die gespielte Karte selbst ist nicht enthalten.
 */
export type CaptureOption = CardId[];

/**
 * Alle legalen Aufnahmen für eine gespielte Karte.
 * Leeres Ergebnis = keine Aufnahme möglich, die Karte bleibt auf dem Tisch liegen.
 *
 * - Zahlenkarte (A=1..10): jede Kombination von Zahlenkarten, die zusammen mit der gespielten Karte exakt 11 ergibt.
 * - Dame nimmt genau eine Dame, König genau einen König (bei mehreren: Auswahl).
 * - Bube nimmt automatisch alle Zahlenkarten und alle Buben (keine Damen/Könige); genau eine Option.
 */
export function findCaptureOptions(played: Card, table: readonly Card[]): CaptureOption[] {
  const sorted = [...table].sort(compareTableOrder);

  if (isJack(played)) {
    const taken = sorted.filter((c) => isNumberCard(c) || isJack(c)).map((c) => c.id);
    return taken.length > 0 ? [taken] : [];
  }

  if (played.rank === QUEEN || played.rank === KING) {
    return sorted.filter((c) => c.rank === played.rank).map((c) => [c.id]);
  }

  const target = CAPTURE_SUM - played.rank;
  const numbers = sorted.filter(isNumberCard);
  const options: CaptureOption[] = [];
  const current: CardId[] = [];

  // Tiefensuche über Teilmengen in Tischreihenfolge -> Ergebnisse sind deterministisch geordnet.
  const search = (start: number, remaining: number): void => {
    if (remaining === 0) {
      options.push([...current]);
      return;
    }
    for (let i = start; i < numbers.length; i++) {
      const card = numbers[i] as Card;
      if (card.rank > remaining) continue;
      current.push(card.id);
      search(i + 1, remaining - card.rank);
      current.pop();
    }
  };
  if (target > 0) search(0, target);
  return options;
}

export function isLegalCapture(played: Card, table: readonly Card[], chosen: readonly CardId[]): boolean {
  const key = canonicalKey(chosen, table);
  if (key === null) return false;
  return findCaptureOptions(played, table).some((opt) => canonicalKey(opt, table) === key);
}

function canonicalKey(ids: readonly CardId[], table: readonly Card[]): string | null {
  const tableIds = new Set(table.map((c) => c.id));
  if (new Set(ids).size !== ids.length) return null;
  if (!ids.every((id) => tableIds.has(id))) return null;
  return [...ids].sort().join(',');
}

/**
 * Beste Aufnahme für die Timeout-Automatik (NACHDEM die Handkarte bereits zufällig gewählt wurde).
 * Feste Prioritäten:
 *   1. möglichst viele Sonderkarten (Kreuz 2, Karo 10)
 *   2. möglichst viele Kreuzkarten
 *   3. möglichst viele Karten insgesamt
 *   4. deterministisch: lexikografisch kleinste Positionen in der sichtbaren Tischordnung
 */
export function chooseBestCapture(options: readonly CaptureOption[], table: readonly Card[]): CaptureOption | null {
  if (options.length === 0) return null;
  const sorted = [...table].sort(compareTableOrder);
  const position = new Map(sorted.map((c, i) => [c.id, i] as const));
  const byId = new Map(sorted.map((c) => [c.id, c] as const));

  const metrics = (opt: CaptureOption) => {
    const cards = opt.map((id) => byId.get(id)).filter((c): c is Card => c !== undefined);
    return {
      special: cards.filter(isSpecialCard).length,
      clubs: cards.filter((c) => c.suit === 'clubs').length,
      total: cards.length,
      positions: opt.map((id) => position.get(id) ?? Number.MAX_SAFE_INTEGER).sort((a, b) => a - b),
    };
  };

  const compare = (a: CaptureOption, b: CaptureOption): number => {
    const ma = metrics(a);
    const mb = metrics(b);
    if (ma.special !== mb.special) return mb.special - ma.special;
    if (ma.clubs !== mb.clubs) return mb.clubs - ma.clubs;
    if (ma.total !== mb.total) return mb.total - ma.total;
    const len = Math.min(ma.positions.length, mb.positions.length);
    for (let i = 0; i < len; i++) {
      const diff = (ma.positions[i] as number) - (mb.positions[i] as number);
      if (diff !== 0) return diff;
    }
    return ma.positions.length - mb.positions.length;
  };

  return [...options].sort(compare)[0] ?? null;
}
