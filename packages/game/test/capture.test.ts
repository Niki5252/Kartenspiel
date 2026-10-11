import { describe, expect, it } from 'vitest';
import { chooseBestCapture, findCaptureOptions, isLegalCapture, parseCardId } from '../src';
import { cards } from './helpers';

const card = (id: string) => parseCardId(id)!;

describe('Zahlenkarten: Summe 11', () => {
  it('2 + 9 = 11', () => {
    expect(findCaptureOptions(card('H2'), cards('S9 HK'))).toEqual([['S9']]);
  });

  it('mehrere Kombinationen: 9 oder 6 + 3', () => {
    const opts = findCaptureOptions(card('H2'), cards('S9 C6 D3'));
    expect(opts).toHaveLength(2);
    expect(opts).toContainEqual(['S9']);
    expect(opts).toContainEqual(['D3', 'C6']);
  });

  it('6 + 4 + Ass = 11 (Ass zählt 1)', () => {
    expect(findCaptureOptions(card('C6'), cards('H4 DA SQ'))).toEqual([['DA', 'H4']]);
  });

  it('Zahlenkarten nehmen keine Bildkarten', () => {
    expect(findCaptureOptions(card('C10'), cards('HJ SQ DK'))).toEqual([]);
  });

  it('keine Aufnahme möglich', () => {
    expect(findCaptureOptions(card('C5'), cards('H2 S3'))).toEqual([]);
  });
});

describe('Dame und König', () => {
  it('Dame nimmt genau eine Dame', () => {
    expect(findCaptureOptions(card('CQ'), cards('HQ SK H5'))).toEqual([['HQ']]);
  });

  it('mehrere Könige -> Auswahl', () => {
    expect(findCaptureOptions(card('CK'), cards('HK SK'))).toEqual([['HK'], ['SK']]);
  });
});

describe('Bube', () => {
  it('nimmt alle Zahlenkarten und Buben, aber keine Damen/Könige', () => {
    expect(findCaptureOptions(card('CJ'), cards('H2 S9 DJ HQ SK'))).toEqual([['H2', 'S9', 'DJ']]);
  });

  it('bleibt liegen, wenn nur Damen/Könige oder nichts da ist', () => {
    expect(findCaptureOptions(card('CJ'), cards('HQ SK'))).toEqual([]);
    expect(findCaptureOptions(card('CJ'), [])).toEqual([]);
  });
});

describe('Legalität', () => {
  it('akzeptiert nur legale Kombinationen, Reihenfolge egal', () => {
    const table = cards('S9 C6 D3 H5');
    expect(isLegalCapture(card('H2'), table, ['C6', 'D3'])).toBe(true);
    expect(isLegalCapture(card('H2'), table, ['D3', 'C6'])).toBe(true);
    expect(isLegalCapture(card('H2'), table, ['H5'])).toBe(false);
    expect(isLegalCapture(card('H2'), table, ['S9', 'S9'])).toBe(false);
    expect(isLegalCapture(card('H2'), table, [])).toBe(false);
  });
});

describe('Beste Aufnahme bei Timeout', () => {
  it('1. Priorität: Sonderkarten (Kreuz 2 / Karo 10)', () => {
    // A spielt: 10 benötigt => Karo 10 nicht direkt; nutze 9 gespielt: braucht 2
    const table = cards('C2 H2');
    const opts = findCaptureOptions(card('S9'), table);
    expect(chooseBestCapture(opts, table)).toEqual(['C2']);
  });

  it('2. Priorität: mehr Kreuzkarten', () => {
    const table = cards('H9 C6 C3');
    const opts = findCaptureOptions(card('S2'), table);
    expect(chooseBestCapture(opts, table)).toEqual(['C3', 'C6']);
  });

  it('3. Priorität: mehr Karten insgesamt', () => {
    const table = cards('H9 D6 S3');
    const opts = findCaptureOptions(card('S2'), table);
    expect(chooseBestCapture(opts, table)).toEqual(['S3', 'D6']);
  });

  it('4. Priorität: deterministisch nach sichtbarer Tischordnung', () => {
    const table = cards('SK HK');
    const opts = findCaptureOptions(card('CK'), table);
    expect(chooseBestCapture(opts, table)).toEqual(['HK']);
  });

  it('Sonderkarte schlägt Kartenanzahl', () => {
    const table = cards('D10 H4 S3 S2 HA');
    // gespielt Ass (1): braucht 10 -> D10 oder H4+S3+S2+? (4+3+2=9 nein) / H4+S3+S2+HA=10
    const opts = findCaptureOptions(card('CA'), table);
    expect(opts.length).toBeGreaterThan(1);
    expect(chooseBestCapture(opts, table)).toEqual(['D10']);
  });

  it('keine Optionen -> null', () => {
    expect(chooseBestCapture([], [])).toBeNull();
  });
});
