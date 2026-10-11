/**
 * Zustand der manuellen Kombinationsauswahl – rein, testbar.
 * Die Optionen kommen vom Server (nur legale Kombinationen); der Client hilft nur bei der Auswahl.
 */
import { type Card, type CardId, type CaptureOption, CAPTURE_SUM, isNumberCard } from '@orlan/game';

export interface CaptureSelectionState {
  /** Karten, die in irgendeiner legalen Kombination vorkommen (hervorheben). */
  legalIds: Set<CardId>;
  /** Karten, die zur aktuellen Teilauswahl passen (direkt ergänzbar). */
  selectableIds: Set<CardId>;
  /** Exakt gewählte legale Kombination, sonst null -> "Nehmen" erst dann aktiv. */
  match: CaptureOption | null;
  /** Nur Zahlenkarten: gespielte Karte + gewählte Karten. */
  isSum: boolean;
  sum: number;
  target: number;
}

export function captureSelectionState(played: Card, options: readonly CaptureOption[], table: readonly Card[], selected: readonly CardId[]): CaptureSelectionState {
  const sel = new Set(selected);
  const byId = new Map(table.map((c) => [c.id, c] as const));
  const compatible = options.filter((o) => selected.every((id) => o.includes(id)));
  const match = options.find((o) => o.length === sel.size && o.every((id) => sel.has(id))) ?? null;
  const isSum = isNumberCard(played);
  const sum = played.rank + selected.reduce((s, id) => s + (byId.get(id)?.rank ?? 0), 0);
  return {
    legalIds: new Set(options.flat()),
    selectableIds: new Set(compatible.flat()),
    match,
    isSum,
    sum: isSum ? sum : 0,
    target: CAPTURE_SUM,
  };
}

/**
 * Antippen einer Tischkarte:
 * - gewählt -> abwählen
 * - passt zur Teilauswahl -> hinzufügen
 * - legal, aber passt nicht -> neue Auswahl mit dieser Karte beginnen
 * - nicht legal -> nichts
 */
export function toggleCaptureCard(options: readonly CaptureOption[], selected: readonly CardId[], cardId: CardId): CardId[] {
  if (selected.includes(cardId)) return selected.filter((id) => id !== cardId);
  if (!options.some((o) => o.includes(cardId))) return [...selected];
  const extended = [...selected, cardId];
  const fits = options.some((o) => extended.every((id) => o.includes(id)));
  if (fits) return extended;
  // Dame/König (bzw. eine einzelne Karte als Option): direkt wechseln
  return [cardId];
}
