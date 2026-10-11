/**
 * Zufallsquelle als Interface, damit die Spiellogik deterministisch testbar bleibt.
 * Der Server verwendet eine kryptografisch sichere Implementierung (siehe apps/server),
 * Tests verwenden einen Seed-basierten Generator.
 */
export interface Rng {
  /** Gleichverteilte Ganzzahl im Bereich [0, maxExclusive). */
  int(maxExclusive: number): number;
}

/** Deterministischer Generator (mulberry32) – nur für Tests und Replays, NICHT für echte Matches. */
export function createSeededRng(seed: number): Rng {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    int(maxExclusive: number): number {
      if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
        throw new Error(`Rng.int: ungültiger Bereich ${maxExclusive}`);
      }
      return Math.floor(next() * maxExclusive);
    },
  };
}

/** Wählt gleichverteilt ein Element. */
export function pickRandom<T>(items: readonly T[], rng: Rng): T {
  if (items.length === 0) throw new Error('pickRandom: leere Liste');
  return items[rng.int(items.length)] as T;
}
