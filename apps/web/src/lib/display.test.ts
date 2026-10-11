import { type MatchState, type PlayerCount, advanceTime, applyAction, createMatch, createSeededRng, projectMatchView } from '@orlan/game';
import type { PlayerPublic, RoomView } from '@orlan/protocol';
import { describe, expect, it } from 'vitest';
import { lastCardLabel, seatDisplays, showEmptyTableHint } from './display';

const NAMES = ['Nikola', 'Ana', 'Marko', 'Lea'];

/** Baut die Sicht eines Clients wie vom Server geliefert. Sitz i = Spieler NAMES[i], Host = Sitz 0. */
function viewFor(state: MatchState, viewerSeat: number, hostSeat = 0): RoomView {
  const n = state.playerCount;
  const players: PlayerPublic[] = NAMES.slice(0, n).map((name, seat) => ({
    id: `id-${seat}`,
    name,
    team: n === 4 ? ((seat % 2) + 1 as 1 | 2) : null,
    ready: true,
    connected: true,
    isHost: seat === hostSeat,
    isBot: false,
    seat,
  }));
  return {
    code: 'ABC234',
    maxPlayers: n,
    status: 'playing',
    hostId: `id-${hostSeat}`,
    myPlayerId: `id-${viewerSeat}`,
    players,
    seats: players.map((p) => p.id),
    countdownEndsAt: null,
    startBlockers: [],
    match: projectMatchView(state, viewerSeat),
    isDevRoom: false,
    serverNow: 0,
    notice: null,
  };
}

function match(playerCount: PlayerCount, dealer = 0): MatchState {
  return createMatch({ playerCount, firstDealerSeat: dealer }, { now: 0, rng: createSeededRng(1) }).state;
}

describe('Host ist eine Rolle, kein Name', () => {
  it('zeigt den echten Namen und Host nur als Rolle', () => {
    const seats = seatDisplays(viewFor(match(3), 1));
    const hostSeat = seats.find((s) => s.seat === 0)!;
    expect(hostSeat.name).toBe('Nikola');
    expect(hostSeat.roles).toContain('host');
    expect(seats.map((s) => s.name)).not.toContain('Host');
    expect(seats.filter((s) => s.roles.includes('host'))).toHaveLength(1);
  });

  it('Host- und Dealer-Rolle sind getrennt (Nikola [Host] [D], andere ohne)', () => {
    const seats = seatDisplays(viewFor(match(3, 0), 0));
    expect(seats[0]!.roles.sort()).toEqual(['dealer', 'host']);
    expect(seats[1]!.roles).toEqual([]);
    // Dealer rotiert, Host bleibt
    const rotated = seatDisplays(viewFor(match(3, 1), 0));
    expect(rotated[0]!.roles).toEqual(['host']);
    expect(rotated[1]!.roles).toEqual(['dealer']);
  });
});

describe('"Letzte Karte für …" bezieht sich auf den aktuellen Dealer', () => {
  it('nennt den Dealer, nicht den Host', () => {
    expect(lastCardLabel(viewFor(match(3, 2), 1, 0))).toBe('Letzte Karte für Marko');
    expect(lastCardLabel(viewFor(match(3, 1), 0, 0))).toBe('Letzte Karte für Ana');
    expect(lastCardLabel(viewFor(match(3, 1), 0, 0))).not.toContain('Nikola');
  });

  it('wechselt mit der Dealerrotation', () => {
    for (let dealer = 0; dealer < 4; dealer++) {
      expect(lastCardLabel(viewFor(match(4, dealer), 0))).toBe(dealer === 0 ? 'Letzte Karte für dich (Dealer)' : `Letzte Karte für ${NAMES[dealer]}`);
    }
  });

  it('enthält nie das Wort "Host"', () => {
    for (let dealer = 0; dealer < 3; dealer++) for (let viewer = 0; viewer < 3; viewer++) {
      expect(lastCardLabel(viewFor(match(3, dealer), viewer))).not.toMatch(/host/i);
    }
  });
});

describe('Perspektive jedes Clients', () => {
  it('3 Spieler: ich unten, rechter Nachbar oben rechts, linker Nachbar oben links – für jeden Client', () => {
    const state = match(3);
    for (let viewer = 0; viewer < 3; viewer++) {
      const seats = seatDisplays(viewFor(state, viewer));
      const pos = Object.fromEntries(seats.map((s) => [s.position, s.name]));
      expect(pos.bottom).toBe(NAMES[viewer]);
      expect(pos.topRight).toBe(NAMES[(viewer + 1) % 3]);
      expect(pos.topLeft).toBe(NAMES[(viewer + 2) % 3]);
      expect(seats.filter((s) => s.isMe).map((s) => s.position)).toEqual(['bottom']);
      expect(new Set(seats.map((s) => s.position)).size).toBe(3);
    }
  });

  it('2 Spieler: Gegner oben; 4 Spieler: Teamkollege oben, Gegner links/rechts', () => {
    for (let viewer = 0; viewer < 2; viewer++) {
      const pos = Object.fromEntries(seatDisplays(viewFor(match(2), viewer)).map((s) => [s.position, s.name]));
      expect(pos).toEqual({ bottom: NAMES[viewer], top: NAMES[1 - viewer] });
    }
    for (let viewer = 0; viewer < 4; viewer++) {
      const seats = seatDisplays(viewFor(match(4), viewer));
      const top = seats.find((s) => s.position === 'top')!;
      const me = seats.find((s) => s.isMe)!;
      expect(top.team).toBe(me.team);
      expect(seats.find((s) => s.position === 'left')!.team).not.toBe(me.team);
      expect(seats.find((s) => s.position === 'right')!.team).not.toBe(me.team);
    }
  });
});

describe('"Tisch ist leer"', () => {
  it('erscheint nicht beim Mischen, Schneiden oder der Wahl Spieler/Tisch zuerst', () => {
    const ctx = { now: 0, rng: createSeededRng(2) };
    let state = match(2);
    expect(showEmptyTableHint(viewFor(state, 0))).toBe(false); // Mischen
    ctx.now = state.round.deadline!;
    state = advanceTime(state, ctx).state;
    expect(state.round.phase).toBe('cutting');
    expect(showEmptyTableHint(viewFor(state, 0))).toBe(false);
    const cut = applyAction(state, { type: 'cut', seat: 1, index: 10 }, ctx);
    if (!cut.ok) throw new Error(cut.error);
    expect(cut.state.round.phase).toBe('choosingDealOrder');
    expect(showEmptyTableHint(viewFor(cut.state, 0))).toBe(false);
  });

  it('erscheint in einer echten Spielphase, wenn der Tisch leer ist', () => {
    const state = match(2);
    state.round.phase = 'turn';
    state.round.dealsDone = 1;
    state.round.table = [];
    expect(showEmptyTableHint(viewFor(state, 0))).toBe(true);
  });
});
