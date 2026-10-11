/**
 * Animationen sind reine Darstellung: Sie verändern keinen Zustand, passen in die Serverphasen
 * und überspringen nach Reconnect bereits Vergangenes.
 */
import {
  type MatchState,
  type PlayerCount,
  advanceTime,
  applyAction,
  autoActionFor,
  createMatch,
  createSeededRng,
  parseCardId,
  projectMatchView,
  sortTable,
} from '@orlan/game';
import type { PlayerPublic, RoomView } from '@orlan/protocol';
import { describe, expect, it } from 'vitest';
import { timerWarningDelay } from '../sound/timerWarning';
import {
  activeFlights,
  dealPackets,
  flightsEnd,
  moveTimeline,
  phaseVisibility,
  planFlights,
  previousDealerSeat,
} from './timeline';

function roomView(state: MatchState, viewerSeat: number | null): RoomView {
  const n = state.playerCount;
  const players: PlayerPublic[] = Array.from({ length: n }, (_, seat) => ({
    id: `p${seat}`, name: `P${seat + 1}`, team: null, ready: true, connected: true, everConnected: true, isHost: seat === 0, isBot: false, seat,
  }));
  return {
    code: 'ABC234', maxPlayers: n, status: 'playing', hostId: 'p0', myPlayerId: viewerSeat === null ? 'x' : `p${viewerSeat}`,
    players, seats: players.map((p) => p.id), countdownEndsAt: null, startBlockers: [],
    match: projectMatchView(state, viewerSeat), isDevRoom: false, serverNow: 0, notice: null,
  };
}

function deepFreeze<T>(obj: T): T {
  if (obj && typeof obj === 'object') {
    Object.freeze(obj);
    for (const v of Object.values(obj)) deepFreeze(v);
  }
  return obj;
}

/** Spielt ein ganzes Match automatisch und liefert jeden Zwischenzustand. */
function simulate(playerCount: PlayerCount, seed: number): MatchState[] {
  const ctx = { now: 0, rng: createSeededRng(seed) };
  let state = createMatch({ playerCount, firstDealerSeat: 0 }, ctx).state;
  const states = [state];
  for (let i = 0; i < 4000 && state.status === 'running'; i++) {
    let acted = false;
    for (let seat = 0; seat < playerCount && !acted; seat++) {
      const action = i % 4 === 0 ? null : autoActionFor(state, seat, ctx.rng);
      if (action) {
        const r = applyAction(state, action, ctx);
        if (r.ok) { state = r.state; acted = true; }
      }
    }
    if (!acted) {
      ctx.now = state.round.deadline ?? ctx.now;
      state = advanceTime(state, ctx).state;
    }
    states.push(state);
  }
  return states;
}

describe('Animationen verändern keine Spiellogik', () => {
  for (const n of [2, 3, 4] as const) {
    it(`${n} Spieler: Planung über ein ganzes Match mutiert nichts und bleibt in der Serverphase`, () => {
      const states = simulate(n, 40 + n);
      expect(states.at(-1)!.status).toBe('finished');
      for (const state of states.filter((_, i) => i % 3 === 0)) {
        const view = deepFreeze(roomView(state, 0));
        const before = JSON.stringify(view);
        const flights = planFlights(view); // würde bei Mutation einer eingefrorenen Sicht werfen
        phaseVisibility(view);
        expect(JSON.stringify(view)).toBe(before);
        // Jede Animation endet spätestens mit der Serverphase -> der nächste Timer startet danach.
        const phaseDuration = state.round.deadline === null ? Infinity : state.round.deadline - state.round.phaseStartedAt;
        expect(flightsEnd(flights)).toBeLessThanOrEqual(phaseDuration);
      }
    });
  }

  it('alle Clients planen dieselben Animationen (gleiche Schlüssel und Zeiten)', () => {
    const states = simulate(4, 9);
    for (const state of states.filter((_, i) => i % 7 === 0)) {
      const plans = [0, 1, 2, 3, null].map((seat) => planFlights(roomView(state, seat)).map((f) => [f.key, f.waypoints.map((w) => w.at)]));
      for (const p of plans) expect(p).toEqual(plans[0]);
    }
  });
});

describe('Zeitpläne', () => {
  function dealingState(order: 'playersFirst' | 'tableFirst', dealer = 1) {
    const ctx = { now: 0, rng: createSeededRng(3) };
    let state = createMatch({ playerCount: 4, firstDealerSeat: dealer }, ctx).state;
    ctx.now = state.round.deadline!;
    state = advanceTime(state, ctx).state;
    const cutter = (dealer + 1) % 4;
    let r = applyAction(state, { type: 'cut', seat: cutter, index: 12 }, ctx);
    if (!r.ok) throw new Error(r.error);
    ctx.now = r.state.round.deadline!;
    state = advanceTime(r.state, ctx).state;
    r = applyAction(state, { type: 'chooseDealOrder', seat: cutter, order }, ctx);
    if (!r.ok) throw new Error(r.error);
    return r.state;
  }

  it('Austeilen: 4er-Pakete nach rechts ab dem Spieler rechts vom Dealer, Tisch zuerst/zuletzt', () => {
    const last = dealPackets(roomView(dealingState('playersFirst'), 0));
    expect(last.map((p) => (p.target.kind === 'table' ? 'T' : p.target.seat))).toEqual([2, 3, 0, 1, 'T']);
    const first = dealPackets(roomView(dealingState('tableFirst'), 0));
    expect(first.map((p) => (p.target.kind === 'table' ? 'T' : p.target.seat))).toEqual(['T', 2, 3, 0, 1]);
    // kompakt und nacheinander, alles innerhalb der Austeilphase
    const state = dealingState('playersFirst');
    for (let i = 1; i < last.length; i++) expect(last[i]!.startMs).toBeGreaterThan(last[i - 1]!.startMs);
    expect(Math.max(...last.map((p) => p.arriveMs))).toBeLessThanOrEqual(state.timings.dealMs);
    // Handkarten werden erst beim Eintreffen des eigenen Pakets sichtbar
    const vis = phaseVisibility(roomView(state, 0));
    expect(vis.handAppearAt[0]).toBe(last[2]!.arriveMs);
  });

  it('Kartenflug 0,4–0,8 s, Aufnahme gesamt 1–1,5 s', () => {
    const t = moveTimeline(1300);
    expect(t.flyInEnd).toBeGreaterThanOrEqual(400);
    expect(t.flyInEnd).toBeLessThanOrEqual(800);
    expect(t.total).toBeGreaterThanOrEqual(1000);
    expect(t.total).toBeLessThanOrEqual(1500);
  });

  it('Aufnahme: Karten bleiben bis zum Zusammenziehen sichtbar, werden angehoben, Ende = Phasenende', () => {
    const ctx = { now: 0, rng: createSeededRng(1) };
    const state = createMatch({ playerCount: 2, firstDealerSeat: 0 }, ctx).state;
    state.round.phase = 'turn';
    state.round.deadline = 10_000;
    state.round.currentSeat = 1;
    state.round.hands = [[parseCardId('C3')!], [parseCardId('H2')!]];
    state.round.table = sortTable([parseCardId('S9')!, parseCardId('HK')!]);
    const r = applyAction(state, { type: 'playCard', seat: 1, cardId: 'H2' }, ctx);
    if (!r.ok) throw new Error(r.error);
    const view = roomView(r.state, 0);
    const vis = phaseVisibility(view);
    expect(vis.table.map((c) => c.id)).toEqual(['S9', 'HK']); // S9 noch sichtbar (wird eingesammelt)
    expect(vis.lifted).toEqual(['S9']);
    const flights = planFlights(view);
    expect(flights.map((f) => f.card?.id)).toEqual(['H2', 'S9']);
    expect(flightsEnd(flights)).toBe(r.state.timings.moveAnimationMs);
    expect(flights[0]!.waypoints.at(-1)!.anchor).toBe('seat-1'); // zum Spieler, der aufgenommen hat
  });

  it('Dealer-Chip wandert vom vorherigen Dealer (links) zum neuen Dealer', () => {
    expect(previousDealerSeat(0, 3)).toBe(2);
    const ctx = { now: 0, rng: createSeededRng(1) };
    const state = createMatch({ playerCount: 3, firstDealerSeat: 2 }, ctx).state;
    state.round.number = 2;
    const chip = planFlights(roomView(state, 0)).find((f) => f.kind === 'chip')!;
    expect(chip.waypoints.map((w) => w.anchor)).toEqual(['chip-1', 'chip-2']);
    // in Runde 1 gibt es keinen Wechsel
    state.round.number = 1;
    expect(planFlights(roomView(state, 0))).toEqual([]);
  });
});

describe('Reconnect / langsames Gerät', () => {
  it('bereits beendete Flüge werden übersprungen, laufende setzen an der richtigen Stelle fort', () => {
    const states = simulate(3, 5);
    const withCapture = states.find((s) => s.round.phase === 'moveAnimation' && (s.round.lastMove?.captured.length ?? 0) > 0)!;
    const flights = planFlights(roomView(withCapture, 1));
    expect(activeFlights(flights, 0)).toHaveLength(flights.length);
    expect(activeFlights(flights, withCapture.timings.moveAnimationMs)).toHaveLength(0);
    expect(activeFlights(flights, 1e9)).toHaveLength(0);
  });
});

describe('Timer-Warnton', () => {
  const ctx = { now: 0, rng: createSeededRng(1) };
  const state = createMatch({ playerCount: 2, firstDealerSeat: 0 }, ctx).state;
  state.round.phase = 'turn';
  state.round.currentSeat = 1;
  state.round.deadline = 10_000;

  it('nur für den Spieler am Zug, 3 s vor Ablauf', () => {
    expect(timerWarningDelay(roomView(state, 1), 0)).toEqual({ key: expect.any(String), delayMs: 7000 });
    expect(timerWarningDelay(roomView(state, 1), 8000)!.delayMs).toBe(0);
    expect(timerWarningDelay(roomView(state, 0), 0)).toBeNull();
    expect(timerWarningDelay(roomView(state, null), 0)).toBeNull();
    expect(timerWarningDelay(roomView(state, 1), 10_001)).toBeNull();
  });

  it('Kombinationsauswahl teilt die Warnung des Zuges (kein doppelter Ton)', () => {
    const key = timerWarningDelay(roomView(state, 1), 0)!.key;
    const choosing = structuredClone(state);
    choosing.round.phase = 'choosingCapture';
    choosing.round.pending = { seat: 1, card: parseCardId('H2')!, options: [] };
    expect(timerWarningDelay(roomView(choosing, 1), 0)!.key).toBe(key);
  });
});
