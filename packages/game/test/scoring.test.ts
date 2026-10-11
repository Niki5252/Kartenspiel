import { describe, expect, it } from 'vitest';
import { determineMatchWinner, scoreRound } from '../src';
import { cards } from './helpers';

describe('Rundenwertung', () => {
  it('vergibt max. 5 Punkte', () => {
    const r = scoreRound(['a', 'b'], {
      a: cards('C2 D10 C3 C4 H5'),
      b: cards('S6 H7'),
    });
    expect(r.stats.find((s) => s.sideId === 'a')?.points).toBe(5);
    expect(r.stats.find((s) => s.sideId === 'b')?.points).toBe(0);
  });

  it('Gleichstand bei Karten und Kreuz -> keine Punkte (Beispiel 1:1:0)', () => {
    const r = scoreRound(['a', 'b', 'c'], {
      a: cards('C2 C3 H4 H5'),
      b: cards('D10 C4 C5 S7'),
      c: cards('S2 S3'),
    });
    expect(r.mostCardsSide).toBeNull();
    expect(r.mostClubsSide).toBeNull();
    expect(r.stats.map((s) => s.points)).toEqual([1, 1, 0]);
  });

  it('Kreuzmehrheit separat von Kartenmehrheit', () => {
    const r = scoreRound(['a', 'b'], {
      a: cards('H3 H4 H5 H6'),
      b: cards('C3 C4'),
    });
    expect(r.mostCardsSide).toBe('a');
    expect(r.mostClubsSide).toBe('b');
  });
});

describe('Matchende', () => {
  it('2 Spieler / Teams: >= 11 und mehr Punkte', () => {
    expect(determineMatchWinner({ a: 13, b: 12 })).toBe('a');
    expect(determineMatchWinner({ a: 11, b: 11 })).toBeNull();
    expect(determineMatchWinner({ a: 10, b: 7 })).toBeNull();
  });

  it('3 Spieler: allein höchste Punktzahl nötig', () => {
    expect(determineMatchWinner({ a: 12, b: 12, c: 8 })).toBeNull();
    expect(determineMatchWinner({ a: 14, b: 13, c: 8 })).toBe('a');
  });
});
