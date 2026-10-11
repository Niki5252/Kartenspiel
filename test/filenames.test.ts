/**
 * Schutz für Windows/macOS: Dort unterscheidet das Dateisystem nicht zwischen Groß- und Kleinschreibung.
 * Zwei Dateien wie `TimerWarning.tsx` und `timerWarning.ts` im selben Ordner würden dort kollidieren
 * (falsche Modulauflösung durch Vite, überschriebene Dateien beim Auschecken).
 */
import { readdirSync } from 'node:fs';
import { dirname, join, parse } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const IGNORED = new Set(['node_modules', 'dist', '.git', 'coverage']);

function collisions(dir: string, out: string[] = []): string[] {
  const entries = readdirSync(dir, { withFileTypes: true }).filter((e) => !IGNORED.has(e.name));
  const seen = new Map<string, string>();
  for (const e of entries) {
    // Ohne Endung vergleichen: Bundler lösen `./TimerWarning` sowohl zu .ts als auch .tsx auf.
    const key = (e.isDirectory() ? e.name : parse(e.name).name).toLowerCase();
    const other = seen.get(key);
    if (other !== undefined && other !== e.name) out.push(`${join(dir, other)} <-> ${join(dir, e.name)}`);
    else seen.set(key, e.name);
    if (e.isDirectory()) collisions(join(dir, e.name), out);
  }
  return out;
}

describe('Dateinamen', () => {
  it('keine zwei Dateien/Ordner unterscheiden sich nur in Groß-/Kleinschreibung', () => {
    expect(collisions(ROOT)).toEqual([]);
  });
});
