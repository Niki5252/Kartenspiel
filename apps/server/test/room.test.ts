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
