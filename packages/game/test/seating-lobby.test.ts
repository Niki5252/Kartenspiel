import { describe, expect, it } from 'vitest';
import {
  assignSeats,
  buildSides,
  canJoinTeam,
  canSetReady,
  dealingOrder,
  firstPlayerSeat,
  nextDealerSeat,
  screenPositionOf,
  sideIdOfSeat,
  startBlockers,
} from '../src';

describe('Sitzordnung & Rotation', () => {
  it('Dealer wandert nach rechts (Sitz + 1)', () => {
    expect(nextDealerSeat(0, 3)).toBe(1);
    expect(nextDealerSeat(2, 3)).toBe(0);
    expect(nextDealerSeat(3, 4)).toBe(0);
  });

  it('erster Spieler / Schneider ist rechts vom Dealer', () => {
    expect(firstPlayerSeat(0, 4)).toBe(1);
    expect(firstPlayerSeat(1, 2)).toBe(0);
  });

  it('Austeilen beginnt rechts vom Dealer, Dealer zuletzt', () => {
    expect(dealingOrder(1, 4)).toEqual([2, 3, 0, 1]);
    expect(dealingOrder(0, 2)).toEqual([1, 0]);
  });

  it('jeder sieht sich unten – 4 Spieler: Partner oben', () => {
    expect(screenPositionOf(0, 0, 4)).toBe('bottom');
    expect(screenPositionOf(0, 1, 4)).toBe('right');
    expect(screenPositionOf(0, 2, 4)).toBe('top');
    expect(screenPositionOf(0, 3, 4)).toBe('left');
    expect(screenPositionOf(3, 1, 4)).toBe('top');
    expect(screenPositionOf(3, 3, 4)).toBe('bottom');
  });

  it('3 Spieler: oben links / oben rechts; 2 Spieler: oben', () => {
    expect(screenPositionOf(1, 2, 3)).toBe('topRight');
    expect(screenPositionOf(1, 0, 3)).toBe('topLeft');
    expect(screenPositionOf(1, 0, 2)).toBe('top');
  });

  it('Teams: Kollegen vis-à-vis', () => {
    expect(buildSides(4).map((s) => s.seats)).toEqual([[0, 2], [1, 3]]);
    expect(sideIdOfSeat(2, 4)).toBe('team1');
    expect(sideIdOfSeat(2, 3)).toBe('seat2');
  });
});

describe('Lobby', () => {
  const p = (id: string, team: 1 | 2 | null, ready = true) => ({ id, team, ready });

  it('max. zwei Spieler pro Team', () => {
    const players = [p('a', 1), p('b', 1), p('c', null)];
    expect(canJoinTeam(players, 'c', 1)).toBe(false);
    expect(canJoinTeam(players, 'c', 2)).toBe(true);
    expect(canJoinTeam(players, 'a', 1)).toBe(true);
  });

  it('bei 4 Spielern erst Team wählen, dann bereit', () => {
    expect(canSetReady(4, p('a', null))).toBe(false);
    expect(canSetReady(4, p('a', 2))).toBe(true);
    expect(canSetReady(3, p('a', null))).toBe(true);
  });

  it('Start erst wenn voll, Teams korrekt und alle bereit', () => {
    expect(startBlockers(2, [p('a', null)])).not.toEqual([]);
    expect(startBlockers(2, [p('a', null), p('b', null, false)])).not.toEqual([]);
    expect(startBlockers(2, [p('a', null), p('b', null)])).toEqual([]);
    expect(startBlockers(4, [p('a', 1), p('b', 1), p('c', 1), p('d', 2)])).not.toEqual([]);
    expect(startBlockers(4, [p('a', 1), p('b', 2), p('c', 1), p('d', 2)])).toEqual([]);
  });

  it('Sitzvergabe: Host zuerst, Teams vis-à-vis', () => {
    expect(assignSeats(3, [p('a', null), p('host', null), p('c', null)], 'host')).toEqual(['host', 'a', 'c']);
    const seats = assignSeats(4, [p('a', 2), p('b', 1), p('host', 2), p('d', 1)], 'host');
    expect(seats).toEqual(['b', 'host', 'd', 'a']);
  });
});
