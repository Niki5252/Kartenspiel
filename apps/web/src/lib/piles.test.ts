import { type MatchState, type PlayerCount, createMatch, createSeededRng, createDeck, projectMatchView } from '@orlan/game';
import type { PlayerPublic, RoomView } from '@orlan/protocol';
import { describe, expect, it } from 'vitest';
import { MAX_PILE_LAYERS, capturedPiles, pileLayers } from './piles';

function view(state: MatchState): RoomView {
  const players: PlayerPublic[] = Array.from({ length: state.playerCount }, (_, seat) => ({
    id: `p${seat}`, name: `P${seat + 1}`, team: null, ready: true, connected: true, everConnected: true, isHost: seat === 0, isBot: false, seat,
  }));
  return {
    code: 'X', maxPlayers: state.playerCount, status: 'playing', hostId: 'p0', myPlayerId: 'p0', players, seats: players.map((p) => p.id),
    seatPlan: null, countdownEndsAt: null, startBlockers: [], match: projectMatchView(state, 0), isDevRoom: false, serverNow: 0, notice: null,
  };
}

function withCaptured(n: PlayerCount, counts: number[]): MatchState {
  const { state } = createMatch({ playerCount: n, firstDealerSeat: 0 }, { now: 0, rng: createSeededRng(1) });
  const deck = createDeck();
  let o = 0;
  state.sides.forEach((s, i) => {
    state.round.captured[s.id] = deck.slice(o, o + (counts[i] ?? 0));
    o += counts[i] ?? 0;
  });
  return state;
}

describe('Gesammelte Kartenhaufen', () => {
  it('wachsen mit der Kartenanzahl (ohne Zahl), leer = kein Haufen', () => {
    expect(pileLayers(0)).toBe(0);
    expect(pileLayers(1)).toBe(1);
    let prev = 0;
    for (let c = 0; c <= 52; c++) {
      expect(pileLayers(c)).toBeGreaterThanOrEqual(prev);
      prev = pileLayers(c);
    }
    expect(pileLayers(40)).toBeGreaterThan(pileLayers(8));
    expect(pileLayers(52)).toBe(MAX_PILE_LAYERS);
  });

  it('verwenden den korrekten Kartenbestand aus dem Serverzustand', () => {
    const piles = capturedPiles(view(withCaptured(3, [14, 3, 0])));
    expect(piles.map((p) => p.count)).toEqual([14, 3, 0]);
    expect(piles.map((p) => p.layers)).toEqual([pileLayers(14), pileLayers(3), 0]);
  });

  it('2 Spieler -> zwei getrennte Haufen an den eigenen Sitzen', () => {
    const piles = capturedPiles(view(withCaptured(2, [5, 9])));
    expect(piles.map((p) => [p.sideId, p.seat, p.team])).toEqual([['seat0', 0, null], ['seat1', 1, null]]);
  });

  it('3 Spieler -> drei getrennte Haufen', () => {
    const piles = capturedPiles(view(withCaptured(3, [1, 2, 3])));
    expect(piles.map((p) => p.seat)).toEqual([0, 1, 2]);
    expect(new Set(piles.map((p) => p.sideId)).size).toBe(3);
  });

  it('4 Spieler -> zwei Team-Haufen (Team 1 bei Sitz 1, Team 2 bei Sitz 2)', () => {
    const piles = capturedPiles(view(withCaptured(4, [20, 6])));
    expect(piles).toHaveLength(2);
    expect(piles.map((p) => [p.sideId, p.team, p.seat, p.count])).toEqual([['team1', 1, 0, 20], ['team2', 2, 1, 6]]);
  });
});
