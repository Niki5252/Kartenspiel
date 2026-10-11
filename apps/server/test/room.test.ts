import { createSeededRng } from '@orlan/game';
import { describe, expect, it } from 'vitest';
import { CONNECTION_LOST_GRACE_MS, Room, RoomError, type RoomClock } from '../src/rooms/Room';

class FakeClock implements RoomClock {
  time = 0;
  private timers = new Map<number, { at: number; fn: () => void }>();
  private nextId = 1;
  now = () => this.time;
  setTimeout = (fn: () => void, ms: number) => {
    const id = this.nextId++;
    this.timers.set(id, { at: this.time + ms, fn });
    return id;
  };
  clearTimeout = (h: unknown) => {
    this.timers.delete(h as number);
  };
  advance(ms: number) {
    const end = this.time + ms;
    for (;;) {
      const due = [...this.timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      this.timers.delete(due[0]);
      this.time = due[1].at;
      due[1].fn();
    }
    this.time = end;
  }
}

function makeRoom(maxPlayers: 2 | 3 | 4, isDev = false) {
  const clock = new FakeClock();
  let n = 0;
  const removed: string[] = [];
  const closed: string[] = [];
  const room = new Room(
    {
      clock,
      rng: createSeededRng(5),
      generatePlayerId: () => `p${++n}`,
      generateToken: () => `t${n}`,
      onChange: () => {},
      onPlayerRemoved: (_r, id) => removed.push(id),
      onClosed: (_r, reason) => closed.push(reason),
    },
    { code: 'ABC234', maxPlayers, isDev },
  );
  return { room, clock, removed, closed };
}

describe('Room – Lobby & Countdown', () => {
  it('Ersteller ist Host, Raum hat feste maximale Spielerzahl', () => {
    const { room } = makeRoom(2);
    const host = room.addPlayer('Nikola');
    room.addPlayer('B');
    expect(room.hostId).toBe(host.id);
    expect(() => room.addPlayer('C')).toThrow(RoomError);
  });

  it('gleiche Namen werden eindeutig gemacht', () => {
    const { room } = makeRoom(3);
    room.addPlayer('Ana');
    expect(room.addPlayer('ana').name).toBe('ana 2');
  });

  it('startet nach 3-2-1 automatisch, sobald alle bereit sind', () => {
    const { room, clock } = makeRoom(2);
    const a = room.addPlayer('A');
    const b = room.addPlayer('B');
    room.setReady(a.id, true);
    expect(room.status).toBe('lobby');
    room.setReady(b.id, true);
    expect(room.status).toBe('countdown');
    expect(room.countdownEndsAt).toBe(3000);
    clock.advance(2999);
    expect(room.status).toBe('countdown');
    clock.advance(1);
    expect(room.status).toBe('playing');
    expect(room.match?.round.dealerSeat).toBe(room.seats!.indexOf(a.id));
  });

  it('"Nicht bereit" bricht den Countdown sofort ab', () => {
    const { room, clock } = makeRoom(2);
    const a = room.addPlayer('A');
    const b = room.addPlayer('B');
    room.setReady(a.id, true);
    room.setReady(b.id, true);
    clock.advance(1500);
    room.setReady(b.id, false);
    expect(room.status).toBe('lobby');
    clock.advance(5000);
    expect(room.match).toBeNull();
  });

  it('Verlassen bricht den Countdown ab', () => {
    const { room } = makeRoom(2);
    const a = room.addPlayer('A');
    const b = room.addPlayer('B');
    room.setReady(a.id, true);
    room.setReady(b.id, true);
    room.leave(b.id);
    expect(room.status).toBe('lobby');
    expect(room.players).toHaveLength(1);
  });

  it('4 Spieler: Teamwahl mit max. 2 pro Team, Teams vis-à-vis', () => {
    const { room, clock } = makeRoom(4);
    const [a, b, c, d] = ['A', 'B', 'C', 'D'].map((n) => room.addPlayer(n));
    expect(() => room.setReady(a!.id, true)).toThrow('Team');
    room.setTeam(a!.id, 1);
    room.setTeam(b!.id, 1);
    expect(() => room.setTeam(c!.id, 1)).toThrow('voll');
    room.setTeam(c!.id, 2);
    room.setTeam(d!.id, 2);
    for (const p of [a, b, c, d]) room.setReady(p!.id, true);
    clock.advance(3000);
    expect(room.seats).toEqual([a!.id, c!.id, b!.id, d!.id]);
  });
});

describe('Room – Host-Rechte', () => {
  it('nur der Host darf entfernen und abbrechen', () => {
    const { room, clock, removed } = makeRoom(2);
    const a = room.addPlayer('A');
    const b = room.addPlayer('B');
    expect(() => room.kick(b.id, a.id)).toThrow();
    room.setReady(a.id, true);
    room.setReady(b.id, true);
    clock.advance(3000);
    expect(() => room.abortMatch(b.id)).toThrow();
    room.abortMatch(a.id);
    expect(room.status).toBe('lobby');
    expect(room.players.every((p) => !p.ready)).toBe(true);
    room.kick(a.id, b.id);
    expect(removed).toEqual([b.id]);
  });

  it('Entfernen während des Matches beendet das Match', () => {
    const { room, clock } = makeRoom(2);
    const a = room.addPlayer('A');
    const b = room.addPlayer('B');
    room.setReady(a.id, true);
    room.setReady(b.id, true);
    clock.advance(3000);
    room.kick(a.id, b.id);
    expect(room.match).toBeNull();
    expect(room.status).toBe('lobby');
  });

  it('Host verlässt den Raum -> Raum wird geschlossen', () => {
    const { room, closed } = makeRoom(2);
    const a = room.addPlayer('A');
    room.addPlayer('B');
    room.leave(a.id);
    expect(closed).toHaveLength(1);
    expect(room.closed).toBe(true);
  });
});

describe('Room – Verbindung', () => {
  it('kurzer Verbindungsverlust bleibt unsichtbar, längerer wird markiert; Match läuft weiter', () => {
    const { room, clock } = makeRoom(2);
    const a = room.addPlayer('A');
    const b = room.addPlayer('B');
    room.markOnline(a.id);
    room.markOnline(b.id);
    room.setReady(a.id, true);
    room.setReady(b.id, true);
    clock.advance(3000);
    const version = room.match!.version;

    room.markOffline(b.id);
    clock.advance(CONNECTION_LOST_GRACE_MS - 1);
    expect(room.getPlayer(b.id)?.connected).toBe(true);
    clock.advance(1);
    expect(room.getPlayer(b.id)?.connected).toBe(false);
    clock.advance(20_000);
    expect(room.match!.version).toBeGreaterThan(version);

    expect(room.authenticate(b.id, 'falsch')).toBeNull();
    expect(room.authenticate(b.id, room.getPlayer(b.id)!.token)).not.toBeNull();
    room.markOnline(b.id);
    expect(room.getPlayer(b.id)?.connected).toBe(true);
  });

  it('Sicht enthält keine Tokens und keine fremden Handkarten', () => {
    const { room, clock } = makeRoom(2);
    const a = room.addPlayer('A');
    const b = room.addPlayer('B');
    room.setReady(a.id, true);
    room.setReady(b.id, true);
    clock.advance(3000 + 1800 + 7000);
    room.gameAction(b.id, { type: 'chooseDealOrder', order: 'playersFirst' });
    const json = JSON.stringify(room.viewFor(a.id));
    expect(json).not.toContain(room.getPlayer(b.id)!.token);
    for (const c of room.match!.round.hands[room.seats!.indexOf(b.id)]!) expect(json).not.toContain(`"${c.id}"`);
  });
});

describe('Room – Dev-Bots', () => {
  it('ein Bot-Match läuft bis zum Ende durch', () => {
    const { room, clock } = makeRoom(3, true);
    const players = ['A', 'B', 'C'].map((n) => room.addPlayer(n));
    for (const p of players) room.setBot(p.id, true);
    expect(room.status).toBe('countdown');
    for (let i = 0; i < 2000 && room.status !== 'finished'; i++) clock.advance(1000);
    expect(room.status).toBe('finished');
    expect(room.match?.winner).not.toBeNull();
  });

  it('Bots nur im Dev-Raum', () => {
    const { room } = makeRoom(2, false);
    const a = room.addPlayer('A');
    expect(() => room.setBot(a.id, true)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Verbindliche Raum-Regeln (zweite Regelrunde)
// ---------------------------------------------------------------------------

function startTwoPlayerMatch() {
  const ctx = makeRoom(2);
  const host = ctx.room.addPlayer('Host');
  const guest = ctx.room.addPlayer('Gast');
  ctx.room.markOnline(host.id);
  ctx.room.markOnline(guest.id);
  ctx.room.setReady(host.id, true);
  ctx.room.setReady(guest.id, true);
  ctx.clock.advance(3000);
  expect(ctx.room.status).toBe('playing');
  return { ...ctx, host, guest };
}

describe('Host verlässt den Raum', () => {
  it('bewusstes Verlassen schließt den Raum für alle – auch während eines Matches', () => {
    const { room, host, closed } = startTwoPlayerMatch();
    room.leave(host.id);
    expect(room.closed).toBe(true);
    expect(closed).toHaveLength(1);
    expect(closed[0]).toContain('geschlossen');
    expect(() => room.gameAction(host.id, { type: 'cut', index: 5 })).toThrow(RoomError);
  });

  it('kurzer Disconnect / Hintergrund / Reload des Hosts schließt den Raum NICHT', () => {
    const { room, host, clock, closed } = startTwoPlayerMatch();
    const version = room.match!.version;
    room.markOffline(host.id);
    clock.advance(1000);
    expect(room.getPlayer(host.id)?.connected).toBe(true); // noch innerhalb der Toleranz
    clock.advance(60_000);
    expect(room.closed).toBe(false);
    expect(closed).toEqual([]);
    expect(room.hostId).toBe(host.id);
    expect(room.getPlayer(host.id)?.connected).toBe(false);
    expect(room.match!.version).toBeGreaterThan(version); // Match lief weiter
    // Reconnect wie bisher
    expect(room.authenticate(host.id, room.getPlayer(host.id)!.token)).not.toBeNull();
    room.markOnline(host.id);
    expect(room.getPlayer(host.id)?.connected).toBe(true);
    expect(room.status).toBe('playing');
  });
});

describe('Host entfernt einen Spieler', () => {
  it('in der Lobby: Spieler weg, Platz frei, Raum bleibt bestehen', () => {
    const { room, removed, closed } = makeRoom(3);
    const host = room.addPlayer('Host');
    const b = room.addPlayer('B');
    room.addPlayer('C');
    expect(() => room.addPlayer('D')).toThrow('voll');
    room.kick(host.id, b.id);
    expect(removed).toEqual([b.id]);
    expect(room.players.map((p) => p.name)).toEqual(['Host', 'C']);
    expect(room.closed).toBe(false);
    expect(closed).toEqual([]);
    expect(room.addPlayer('Neu').name).toBe('Neu');
    expect(room.players).toHaveLength(3);
  });

  it('während des Matches: Match abgebrochen, Punkte verworfen, Raum + Lobby bleiben, Platz frei', () => {
    const { room, clock, host, guest, closed } = startTwoPlayerMatch();
    room.match!.scores = { seat0: 7, seat1: 4 }; // simulierter Zwischenstand
    room.kick(host.id, guest.id);

    expect(room.closed).toBe(false);
    expect(closed).toEqual([]);
    expect(room.status).toBe('lobby');
    expect(room.match).toBeNull();
    expect(room.seats).toBeNull();
    expect(room.notice).toContain('entfernt');
    expect(room.players.map((p) => p.id)).toEqual([host.id]);
    expect(room.players.every((p) => !p.ready)).toBe(true);

    // neuer Spieler belegt den freien Platz, alle werden wieder bereit -> neues Match bei 0 Punkten
    const newcomer = room.addPlayer('Neu');
    room.setReady(host.id, true);
    room.setReady(newcomer.id, true);
    clock.advance(3000);
    expect(room.status).toBe('playing');
    expect(Object.values(room.match!.scores)).toEqual([0, 0]);
    expect(room.match!.round.number).toBe(1);
  });

  it('der Host kann sich nicht selbst entfernen, andere Spieler dürfen nicht kicken', () => {
    const { room, host, guest } = startTwoPlayerMatch();
    expect(() => room.kick(host.id, host.id)).toThrow(RoomError);
    expect(() => room.kick(guest.id, host.id)).toThrow(RoomError);
    expect(room.status).toBe('playing');
  });
});

describe('Tisch/Spieler-Wahl über den Raum', () => {
  it('nach 7 s ohne Wahl entscheidet der Server, eine spätere Wahl wird abgelehnt', () => {
    const { room, clock, host, guest } = startTwoPlayerMatch();
    const cutter = room.seats![(room.match!.round.dealerSeat + 1) % 2]!;
    clock.advance(1800 + 7000); // Mischen + Schneide-Timeout (Auto-Schnitt)
    expect(room.match!.round.phase).toBe('choosingDealOrder');
    clock.advance(7000);
    expect(room.match!.round.dealOrderAuto).toBe(true);
    expect(() => room.gameAction(cutter, { type: 'chooseDealOrder', order: 'tableFirst' })).toThrow(RoomError);
    expect([host.id, guest.id]).toContain(cutter);
  });
});

describe('Nicht-Host verlässt bewusst während eines Matches', () => {
  function threePlayerMatch() {
    const ctx = makeRoom(3);
    const host = ctx.room.addPlayer('Host');
    const b = ctx.room.addPlayer('B');
    const c = ctx.room.addPlayer('C');
    for (const p of [host, b, c]) {
      ctx.room.markOnline(p.id);
      ctx.room.setReady(p.id, true);
    }
    ctx.clock.advance(3000);
    expect(ctx.room.status).toBe('playing');
    ctx.room.match!.scores = { seat0: 6, seat1: 9, seat2: 3 }; // simulierter Zwischenstand
    return { ...ctx, host, b, c };
  }

  it('bricht das Match ab, verwirft Punkte, Raum bleibt, alle zurück in die Lobby', () => {
    const { room, host, b, c, closed, removed } = threePlayerMatch();
    room.leave(b.id);
    expect(room.closed).toBe(false);
    expect(closed).toEqual([]);
    expect(removed).toEqual([b.id]);
    expect(room.status).toBe('lobby');
    expect(room.match).toBeNull();
    expect(room.seats).toBeNull();
    expect(room.hostId).toBe(host.id);
    expect(room.players.map((p) => p.id)).toEqual([host.id, c.id]);
    expect(room.notice).toBe('B hat den Raum verlassen. Das Match wurde beendet.');
    // Bereit-Status zurückgesetzt -> alle müssen erneut "Bereit" wählen
    expect(room.players.every((p) => !p.ready)).toBe(true);
    // Sichten der Verbleibenden zeigen Lobby ohne Match
    for (const p of room.players) {
      const v = room.viewFor(p.id);
      expect(v.status).toBe('lobby');
      expect(v.match).toBeNull();
    }
  });

  it('Platz wird frei, neuer Spieler tritt bei, neues Match startet bei 0 Punkten', () => {
    const { room, clock, host, b, c } = threePlayerMatch();
    room.leave(b.id);
    const newcomer = room.addPlayer('Neu');
    expect(room.players).toHaveLength(3);
    // ohne erneutes Bereit startet nichts
    clock.advance(10_000);
    expect(room.status).toBe('lobby');
    for (const p of [host, c, newcomer]) room.setReady(p.id, true);
    expect(room.status).toBe('countdown');
    clock.advance(3000);
    expect(room.status).toBe('playing');
    expect(room.match!.scores).toEqual({ seat0: 0, seat1: 0, seat2: 0 });
    expect(room.match!.history).toEqual([]);
    expect(room.match!.round.number).toBe(1);
    expect(room.seats).toContain(newcomer.id);
    expect(room.seats).not.toContain(b.id);
  });

  it('der ausgetretene Spieler kann sich mit seinen alten Zugangsdaten nicht mehr einwählen', () => {
    const { room, b } = threePlayerMatch();
    const token = room.getPlayer(b.id)!.token;
    room.leave(b.id);
    expect(room.authenticate(b.id, token)).toBeNull();
  });

  it('kurzer Disconnect eines Nicht-Hosts bricht das Match NICHT ab', () => {
    const { room, clock, b } = threePlayerMatch();
    const scores = { ...room.match!.scores };
    room.markOffline(b.id);
    clock.advance(2000);
    room.markOnline(b.id);
    expect(room.status).toBe('playing');
    expect(room.match!.scores).toEqual(scores);
    expect(room.players).toHaveLength(3);
  });

  it('längerer Disconnect (App im Hintergrund) bricht das Match NICHT ab – nur Markierung', () => {
    const { room, clock, b } = threePlayerMatch();
    room.markOffline(b.id);
    clock.advance(120_000);
    expect(room.status).toBe('playing');
    expect(room.match).not.toBeNull();
    expect(room.getPlayer(b.id)?.connected).toBe(false);
    expect(room.seats).toContain(b.id);
  });

  it('Browser-Reload (offline -> Wiederanmeldung mit Token) bricht das Match NICHT ab', () => {
    const { room, b } = threePlayerMatch();
    const scores = { ...room.match!.scores };
    const token = room.getPlayer(b.id)!.token;
    room.markOffline(b.id);
    expect(room.authenticate(b.id, token)?.id).toBe(b.id);
    room.markOnline(b.id);
    expect(room.status).toBe('playing');
    expect(room.match!.scores).toEqual(scores);
    expect(room.viewFor(b.id).match?.mySeat).toBe(room.seats!.indexOf(b.id));
  });
});
