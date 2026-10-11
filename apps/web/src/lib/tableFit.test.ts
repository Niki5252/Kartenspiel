import { describe, expect, it } from 'vitest';
import { CARD_RATIO, LIFT_RESERVE, fitTableCards } from './tableFit';

describe('Tischkarten passen vollständig in die Tischzone', () => {
  it('für alle realistischen Flächen und Kartenzahlen: nichts ragt heraus', () => {
    for (let width = 160; width <= 1300; width += 37) {
      for (let height = 70; height <= 600; height += 23) {
        for (let count = 1; count <= 16; count++) {
          const r = fitTableCards({ width, height, count });
          if (!r.fits) continue;
          expect(r.usedHeight).toBeLessThanOrEqual(height);
          expect(r.perRow * r.rows).toBeGreaterThanOrEqual(count);
          expect(r.perRow * r.cardWidth + (r.perRow - 1) * 6).toBeLessThanOrEqual(width);
        }
      }
    }
  });

  it('typische Smartphone- und Desktop-Tischzonen passen für einen vollen Tisch (12 Karten)', () => {
    // gemessene Tischzonen-Größen aus dem Browser-Test (Einzelansicht)
    for (const [w, h] of [[330, 200], [215, 210], [370, 230], [1200, 130], [600, 180]] as const) {
      const r = fitTableCards({ width: w, height: h, count: 12 });
      expect(r.fits).toBe(true);
      expect(r.cardWidth).toBeGreaterThanOrEqual(26);
    }
  });

  it('mehr Platz -> nie kleinere Karten; maximal 70 px', () => {
    let prev = 0;
    for (let h = 80; h <= 600; h += 10) {
      const w = fitTableCards({ width: 380, height: h, count: 8 }).cardWidth;
      expect(w).toBeGreaterThanOrEqual(prev);
      expect(w).toBeLessThanOrEqual(70);
      prev = w;
    }
  });

  it('Platz für angehobene/ausgewählte Karten ist eingerechnet', () => {
    const r = fitTableCards({ width: 1000, height: 1000, count: 1 });
    expect(r.usedHeight).toBe(r.cardWidth * CARD_RATIO + LIFT_RESERVE);
  });
});
