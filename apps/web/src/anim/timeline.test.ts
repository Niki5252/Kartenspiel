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
import { timerWarningDelay } from '../sound/timerWarningSchedule';
import {
  activeFlights,
  dealPlan,
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
    players, seats: players.map((p) => p.id), seatPlan: null, countdownEndsAt: null, startBlockers: [],
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

  it('Austeilen: 4er-Pakete nach rechts ab dem Spieler rechts vom Dealer, Tischkarten einzeln zuerst/zuletzt', () => {
    const playersFirst = dealingState('playersFirst');
    const pf = dealPlan(roomView(playersFirst, 0));
    expect(pf.packets.map((p) => (p.target.kind === 'seat' ? p.target.seat : 'T'))).toEqual([2, 3, 0, 1]);
    // Spieler zuerst: Tischkarten werden nach allen Paketen aufgedeckt
    expect(Math.min(...pf.steps.map((s) => s.startMs))).toBeGreaterThanOrEqual(Math.max(...pf.packets.map((p) => p.arriveMs)));
    const tableFirst = dealingState('tableFirst');
    const tf = dealPlan(roomView(tableFirst, 0));
    expect(Math.max(...tf.steps.map((s) => s.endMs))).toBeLessThanOrEqual(Math.min(...tf.packets.map((p) => p.startMs)));
    // genau so lang wie die Serverphase
    for (const st of [playersFirst, tableFirst]) {
      expect(dealPlan(roomView(st, 0)).total).toBe(st.round.deadline! - st.round.phaseStartedAt);
    }
    for (let i = 1; i < pf.packets.length; i++) expect(pf.packets[i]!.startMs).toBeGreaterThan(pf.packets[i - 1]!.startMs);
    // Handkarten werden erst beim Eintreffen des eigenen Pakets sichtbar, Tischkarten erst nach ihrem Aufdecken
    const vis = phaseVisibility(roomView(playersFirst, 0));
    expect(vis.handAppearAt[0]).toBe(pf.packets[2]!.arriveMs);
    for (const step of pf.steps.filter((x) => !x.isJack)) expect(vis.tableAppearAt[step.card.id]).toBe(step.endMs);
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
    expect(flights[0]!.waypoints.at(-1)!.anchor).toBe('pile-seat1'); // zum Haufen des Spielers, der aufgenommen hat
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
  state.round.deadline = state.timings.turnMs; // 30 s

  it('Zug (30 s): nur für den Spieler am Zug, einmal 5 s vor Ablauf – nicht vorher', () => {
    expect(state.timings.turnMs).toBe(30_000);
    expect(timerWarningDelay(roomView(state, 1), 0)).toEqual({ key: expect.any(String), delayMs: 25_000 });
    expect(timerWarningDelay(roomView(state, 1), 20_000)!.delayMs).toBe(5_000);
    expect(timerWarningDelay(roomView(state, 1), 26_000)!.delayMs).toBe(0);
    expect(timerWarningDelay(roomView(state, 0), 0)).toBeNull();
    expect(timerWarningDelay(roomView(state, null), 0)).toBeNull();
    expect(timerWarningDelay(roomView(state, 1), 30_001)).toBeNull();
  });

  it('Schneiden (15 s): Warnung 5 s vor Ablauf; Wahl Spieler/Tisch (7 s): 3 s vor Ablauf', () => {
    const cutting = structuredClone(state);
    cutting.round.phase = 'cutting';
    cutting.round.deadline = cutting.timings.cutMs;
    expect(cutting.timings.cutMs).toBe(15_000);
    expect(timerWarningDelay(roomView(cutting, 1), 0)!.delayMs).toBe(10_000); // Sitz 1 schneidet (rechts vom Dealer 0)
    expect(timerWarningDelay(roomView(cutting, 0), 0)).toBeNull();
    const choosing = structuredClone(cutting);
    choosing.round.phase = 'choosingDealOrder';
    choosing.round.deadline = choosing.timings.dealOrderMs;
    expect(timerWarningDelay(roomView(choosing, 1), 0)!.delayMs).toBe(4_000);
  });

  it('Kombinationsauswahl teilt die Warnung des Zuges (kein doppelter Ton)', () => {
    const key = timerWarningDelay(roomView(state, 1), 0)!.key;
    const choosing = structuredClone(state);
    choosing.round.phase = 'choosingCapture';
    choosing.round.pending = { seat: 1, card: parseCardId('H2')!, options: [] };
    expect(timerWarningDelay(roomView(choosing, 1), 0)!.key).toBe(key);
  });
});
