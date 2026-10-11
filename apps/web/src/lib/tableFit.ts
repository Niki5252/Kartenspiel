/**
 * Größte Kartenbreite, bei der ALLE Tischkarten vollständig in die verfügbare Fläche passen – rein, testbar.
 * Berücksichtigt Zeilenumbruch, Abstände und Platz für angehobene (ausgewählte) Karten.
 */
export const CARD_RATIO = 1.4;
/** Platz nach oben für angehobene/ausgewählte Karten (translateY + Häkchen). */
export const LIFT_RESERVE = 18;

export interface FitInput {
  width: number;
  height: number;
  count: number;
  gap?: number;
  maxWidth?: number;
  minWidth?: number;
}

export interface FitResult {
  cardWidth: number;
  perRow: number;
  rows: number;
  /** Benötigte Höhe inkl. Reserve – <= height, sofern `fits`. */
  usedHeight: number;
  fits: boolean;
}

export function layoutFor(width: number, count: number, cardWidth: number, gap: number) {
  const perRow = Math.max(1, Math.floor((width + gap) / (cardWidth + gap)));
  const rows = count === 0 ? 0 : Math.ceil(count / perRow);
  const usedHeight = rows === 0 ? 0 : rows * cardWidth * CARD_RATIO + (rows - 1) * gap + LIFT_RESERVE;
  return { perRow, rows, usedHeight };
}

export function fitTableCards({ width, height, count, gap = 6, maxWidth = 70, minWidth = 24 }: FitInput): FitResult {
  for (let w = Math.floor(maxWidth); w >= minWidth; w--) {
    const l = layoutFor(width, count, w, gap);
    if (l.usedHeight <= height && (count === 0 || w <= width)) return { cardWidth: w, ...l, fits: true };
  }
  const l = layoutFor(width, count, minWidth, gap);
  return { cardWidth: minWidth, ...l, fits: l.usedHeight <= height };
}
