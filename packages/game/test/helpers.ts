import { type Card, parseCardId } from '../src';

/** Karten aus Kurz-IDs, z. B. cards('C2 D10 HQ'). */
export function cards(spec: string): Card[] {
  return spec
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => {
      const c = parseCardId(id);
      if (!c) throw new Error(`Unbekannte Karte ${id}`);
      return c;
    });
}

export function ids(list: readonly Card[]): string[] {
  return list.map((c) => c.id);
}
