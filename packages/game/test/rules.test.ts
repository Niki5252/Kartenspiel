/**
 * Verbindliche Regeln aus der zweiten Regelrunde:
 * Tisch/Spieler-Timer, automatische Aufnahme, manuelle Auswahl, Timeouts, Bube.
 */
import { describe, expect, it } from 'vitest';
import {
  type EngineContext,
  type MatchState,
  type PlayerCount,
  type Rng,
  applyAction,
  advanceTime,
  createMatch,
  createSeededRng,
  isLegalCapture,
  projectMatchView,
  sortTable,
} from '../src';
import { cards, ids } from './helpers';

/** Liefert der Reihe nach die vorgegebenen Werte (für gezielte "Zufalls"-Ergebnisse). */
function scriptedRng(values: number[]): Rng & { calls: number[] } {
  const calls: number[] = [];
  return {
    calls,
    int(max: number) {
      calls.push(max);
      const v = values.shift();
      if (v === undefined) throw new Error('scriptedRng erschöpft');
      if (v >= max) throw new Error(`scriptedRng: ${v} >= ${max}`);
      return v;
    },
  };
}

/** Zufallsquelle, die jede Nutzung verbietet. */
const forbiddenRng: Rng = {
  int() {
    throw new Error('Zufall darf hier nicht verwendet werden');
  },
};

function ok(result: ReturnType<typeof applyAction>): MatchState {
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

/** Match direkt in der Zugphase mit vorgegebenen Händen und Tischkarten. */
function turnState(hands: string[], table: string, playerCount: PlayerCount = 2): { state: MatchState; ctx: EngineContext } {
  const ctx: EngineContext = { now: 10_000, rng: createSeededRng(1) };
  const { state } = createMatch({ playerCount, firstDealerSeat: 0 }, ctx);
  const r = state.round;
  r.phase = 'turn';
  r.phaseStartedAt = ctx.now;
  r.deadline = ctx.now + state.timings.turnMs;
  r.currentSeat = 1;
  r.hands = hands.map(cards);
  r.table = sortTable(cards(table));
  r.deck = [];
  return { state, ctx };
}

/** Match direkt nach Schneiden + Schnitt-Animation (Phase choosingDealOrder). */
function afterCut(seed = 3): { state: MatchState; ctx: EngineContext } {
  const ctx: EngineContext = { now: 0, rng: createSeededRng(seed) };
  let { state } = createMatch({ playerCount: 3, firstDealerSeat: 0 }, ctx);
  ctx.now = state.round.deadline!;
  state = advanceTime(state, ctx).state;
  state = ok(applyAction(state, { type: 'cut', seat: 1, index: 20 }, ctx));
  // Schnitt-Animation abwarten – erst danach beginnen die 7 s
  ctx.now = state.round.deadline!;
  state = advanceTime(state, ctx).state;
  return { state, ctx };
}

// ---------------------------------------------------------------------------

describe('Tisch zuerst / Spieler zuerst – 7-Sekunden-Timer', () => {
  it('nach dem Schneiden läuft ein serverseitiger 7-s-Timer, für alle sichtbar', () => {
    const { state, ctx } = afterCut();
    expect(state.round.phase).toBe('choosingDealOrder');
    expect(state.round.deadline).toBe(ctx.now + 7000);
    for (const seat of [0, 1, 2]) expect(projectMatchView(state, seat).round.deadline).toBe(ctx.now + 7000);
  });

  it('innerhalb der 7 s passiert ohne Wahl nichts', () => {
    const { state, ctx } = afterCut();
    const r = advanceTime(state, { ...ctx, now: ctx.now + 6999 });
    expect(r.changed).toBe(false);
    expect(r.state.round.phase).toBe('choosingDealOrder');
  });

  it('eine Wahl innerhalb der 7 s wird übernommen', () => {
    const { state, ctx } = afterCut();
    const next = ok(applyAction(state, { type: 'chooseDealOrder', seat: 1, order: 'tableFirst' }, { ...ctx, now: ctx.now + 6000 }));
    expect(next.round.dealOrder).toBe('tableFirst');
    expect(next.round.dealOrderAuto).toBe(false);
    expect(next.round.phase).toBe('dealing');
  });

  it('nach Ablauf entscheidet der Server automatisch und das Spiel läuft weiter', () => {
    const { state, ctx } = afterCut();
    const r = advanceTime(state, { ...ctx, now: ctx.now + 7000 });
    expect(r.state.round.dealOrderAuto).toBe(true);
    expect(['playersFirst', 'tableFirst']).toContain(r.state.round.dealOrder);
    expect(r.state.round.phase).toBe('dealing');
    expect(r.state.round.hands.map((h) => h.length)).toEqual([4, 4, 4]);
    expect(r.state.round.table).toHaveLength(4);
    expect(r.events).toContainEqual(expect.objectContaining({ type: 'dealOrderChosen', auto: true }));
    // weiter bis zum ersten Zug
    const turn = advanceTime(r.state, { ...ctx, now: r.state.round.deadline! });
    expect(turn.state.round.phase).toBe('turn');
  });

  it('automatische Wahl ist reiner Zufall zwischen genau zwei Optionen', () => {
    for (const [value, expected] of [[0, 'playersFirst'], [1, 'tableFirst']] as const) {
      const { state, ctx } = afterCut();
      const rng = scriptedRng([value]);
      const r = advanceTime(state, { now: ctx.now + 7000, rng });
      expect(r.state.round.dealOrder).toBe(expected);
      // Die einzige Zufallsentscheidung ist eine Wahl aus 2 – keine Abhängigkeit von den Karten.
      expect(rng.calls).toEqual([2]);
    }
  });

  it('automatische Wahl ist über viele Runden ungefähr gleich verteilt', () => {
    const counts = { playersFirst: 0, tableFirst: 0 };
    for (let seed = 1; seed <= 400; seed++) {
      const { state, ctx } = afterCut(seed);
      const r = advanceTime(state, { now: ctx.now + 7000, rng: createSeededRng(seed * 7919) });
      counts[r.state.round.dealOrder!]++;
    }
    expect(counts.playersFirst).toBeGreaterThan(150);
    expect(counts.tableFirst).toBeGreaterThan(150);
  });

  it('nach dem automatischen Entscheid ist keine manuelle Wahl mehr möglich', () => {
    const { state, ctx } = afterCut();
    const auto = advanceTime(state, { ...ctx, now: ctx.now + 7000 }).state;
    expect(applyAction(auto, { type: 'chooseDealOrder', seat: 1, order: 'tableFirst' }, ctx).ok).toBe(false);
  });
});

describe('Genau eine Aufnahmemöglichkeit -> sofort automatisch', () => {
  it('2 nimmt die einzige 9 automatisch', () => {
    const { state, ctx } = turnState(['C3', 'H2 S5'], 'S9 HK');
    const next = ok(applyAction(state, { type: 'playCard', seat: 1, cardId: 'H2' }, ctx));
    expect(next.round.phase).toBe('moveAnimation');
    expect(next.round.pending).toBeNull();
    expect(ids(next.round.lastMove!.captured)).toEqual(['S9']);
    expect(ids(next.round.table)).toEqual(['HK']);
    expect(ids(next.round.captured.seat1!)).toEqual(['H2', 'S9']);
  });

  it('jede Zahlenkarte mit genau einer 11er-Kombination (6 nimmt 4 + Ass)', () => {
    const { state, ctx } = turnState(['C3', 'C6'], 'H4 DA SQ');
    const next = ok(applyAction(state, { type: 'playCard', seat: 1, cardId: 'C6' }, ctx));
    expect(ids(next.round.lastMove!.captured)).toEqual(['DA', 'H4']);
  });

  it('Dame mit genau einer Dame und König mit genau einem König werden automatisch genommen', () => {
    for (const [played, table, taken] of [['CQ', 'HQ SK H5', 'HQ'], ['CK', 'HQ SK H5', 'SK']] as const) {
      const { state, ctx } = turnState(['C3', played], table);
      const next = ok(applyAction(state, { type: 'playCard', seat: 1, cardId: played }, ctx));
      expect(next.round.phase).toBe('moveAnimation');
      expect(ids(next.round.lastMove!.captured)).toEqual([taken]);
    }
  });

  it('die Aufnahme kann nicht abgelehnt werden (Karte bleibt nie freiwillig liegen)', () => {
    const { state, ctx } = turnState(['C3', 'H2'], 'S9');
    const next = ok(applyAction(state, { type: 'playCard', seat: 1, cardId: 'H2' }, ctx));
    // keine Auswahlphase -> kein "nichts nehmen" möglich
    expect(next.round.phase).not.toBe('choosingCapture');
    expect(next.round.table.find((c) => c.id === 'H2')).toBeUndefined();
    expect(applyAction(next, { type: 'chooseCapture', seat: 1, cardIds: [] }, ctx).ok).toBe(false);
    // auch die Legalitätsprüfung lehnt eine leere Aufnahme ab
    expect(isLegalCapture(cards('H2')[0]!, cards('S9'), [])).toBe(false);
  });

  it('ohne mögliche Aufnahme bleibt die Karte sortiert auf dem Tisch', () => {
    const { state, ctx } = turnState(['C3', 'H5'], 'S2 HK');
    const next = ok(applyAction(state, { type: 'playCard', seat: 1, cardId: 'H5' }, ctx));
    expect(next.round.lastMove!.captured).toEqual([]);
    expect(ids(next.round.table)).toEqual(['S2', 'H5', 'HK']);
  });
});

describe('Mehrere Möglichkeiten -> manuelle Auswahl', () => {
  const setup = () => turnState(['C3', 'H2 S5 D7'], 'S9 C6 D3');

  it('führt zur Auswahlphase, die gespielte Karte ist verbindlich und aus der Hand entfernt', () => {
    const { state, ctx } = setup();
    const next = ok(applyAction(state, { type: 'playCard', seat: 1, cardId: 'H2' }, ctx));
    expect(next.round.phase).toBe('choosingCapture');
    expect(next.round.pending?.card.id).toBe('H2');
    expect(next.round.pending?.options).toHaveLength(2);
    expect(ids(next.round.hands[1]!)).toEqual(['S5', 'D7']);
    // Timer läuft weiter (gleiche Deadline wie der Zug)
    expect(next.round.deadline).toBe(state.round.deadline);
    // nur der betroffene Spieler sieht die Optionen
    expect(projectMatchView(next, 1).round.pending?.options).toHaveLength(2);
    expect(projectMatchView(next, 0).round.pending?.options).toBeNull();
  });

  it('die gespielte Karte kann während der Auswahl nicht geändert werden', () => {
    const { state, ctx } = setup();
    const next = ok(applyAction(state, { type: 'playCard', seat: 1, cardId: 'H2' }, ctx));
    expect(applyAction(next, { type: 'playCard', seat: 1, cardId: 'S5' }, ctx).ok).toBe(false);
    expect(applyAction(next, { type: 'playCard', seat: 1, cardId: 'H2' }, ctx).ok).toBe(false);
    expect(next.round.pending?.card.id).toBe('H2');
  });

  it('nur legale Kombinationen können mit "Nehmen" bestätigt werden', () => {
    const { state, ctx } = setup();
    const next = ok(applyAction(state, { type: 'playCard', seat: 1, cardId: 'H2' }, ctx));
    expect(applyAction(next, { type: 'chooseCapture', seat: 1, cardIds: ['S9', 'D3'] }, ctx).ok).toBe(false);
    expect(applyAction(next, { type: 'chooseCapture', seat: 1, cardIds: [] }, ctx).ok).toBe(false);
    expect(applyAction(next, { type: 'chooseCapture', seat: 0, cardIds: ['S9'] }, ctx).ok).toBe(false);
    const taken = ok(applyAction(next, { type: 'chooseCapture', seat: 1, cardIds: ['C6', 'D3'] }, ctx));
    expect(taken.round.phase).toBe('moveAnimation');
    expect(ids(taken.round.lastMove!.captured)).toEqual(['D3', 'C6']);
    expect(taken.round.lastMove!.card.id).toBe('H2');
    expect(ids(taken.round.table)).toEqual(['S9']);
  });
});

describe('Timeout vor dem Spielen einer Karte', () => {
  it('wählt rein zufällig eine Handkarte – exakt die vom Zufall bestimmte, ohne Strategie', () => {
    // Hand: S5 (nimmt nichts), C9 (nimmt Kreuz 2), D3 (nichts), HQ (nichts). Zufall bestimmt allein.
    const hand = 'S5 C9 D3 HQ';
    const order = ['S5', 'C9', 'D3', 'HQ'];
    for (let index = 0; index < 4; index++) {
      const { state, ctx } = turnState(['C3', hand], 'C2 D10 H4');
      const rng = scriptedRng([index]);
      const next = advanceTime(state, { now: state.round.deadline!, rng }).state;
      expect(next.round.lastMove!.card.id).toBe(order[index]);
      expect(next.round.lastMove!.byTimeout).toBe(true);
      expect(rng.calls[0]).toBe(4); // gleichverteilt über die ganze Hand
    }
  });

  it('auch eine strategisch schlechte Karte wird gespielt, wenn der Zufall sie wählt', () => {
    const { state } = turnState(['C3', 'S5 C9'], 'C2 D10');
    const next = advanceTime(state, { now: state.round.deadline!, rng: scriptedRng([0]) }).state;
    expect(next.round.lastMove!.card.id).toBe('S5');
    expect(next.round.lastMove!.captured).toEqual([]);
    expect(ids(next.round.table)).toEqual(['C2', 'S5', 'D10']);
  });

  it('zufällige Karte mit genau einer Aufnahme -> automatisch aufnehmen', () => {
    const { state } = turnState(['C3', 'H2'], 'S9 HK');
    const next = advanceTime(state, { now: state.round.deadline!, rng: scriptedRng([0]) }).state;
    expect(ids(next.round.lastMove!.captured)).toEqual(['S9']);
  });

  it('zufällige Karte mit mehreren Aufnahmen -> beste Kombination (Kreuz 2 vor allem anderen)', () => {
    const { state } = turnState(['C3', 'S9'], 'H2 C2');
    const next = advanceTime(state, { now: state.round.deadline!, rng: scriptedRng([0]) }).state;
    expect(ids(next.round.lastMove!.captured)).toEqual(['C2']);
    expect(next.round.phase).toBe('moveAnimation');
  });

  it('zufälliger Bube -> automatische Buben-Regel', () => {
    const { state } = turnState(['C3', 'HJ'], 'S3 D7 CJ HQ SK');
    const next = advanceTime(state, { now: state.round.deadline!, rng: scriptedRng([0]) }).state;
    expect(ids(next.round.lastMove!.captured)).toEqual(['S3', 'D7', 'CJ']);
    expect(ids(next.round.table)).toEqual(['HQ', 'SK']);
  });
});

describe('Timeout nach bereits bestätigter Handkarte', () => {
  it('wählt KEINE neue Handkarte (kein Zufall) und behält die gespielte Karte', () => {
    const { state, ctx } = turnState(['C3', 'H2 S5 D7'], 'S9 C6 D3');
    const pending = ok(applyAction(state, { type: 'playCard', seat: 1, cardId: 'H2' }, ctx));
    const next = advanceTime(pending, { now: pending.round.deadline!, rng: forbiddenRng }).state;
    expect(next.round.lastMove!.card.id).toBe('H2');
    expect(next.round.lastMove!.byTimeout).toBe(true);
    expect(ids(next.round.hands[1]!)).toEqual(['S5', 'D7']);
  });

  it('wählt die beste Kombination: 1. Sonderkarten', () => {
    const { state, ctx } = turnState(['C3', 'S9'], 'H2 C2');
    const pending = ok(applyAction(state, { type: 'playCard', seat: 1, cardId: 'S9' }, ctx));
    const next = advanceTime(pending, { now: pending.round.deadline!, rng: forbiddenRng }).state;
    expect(ids(next.round.lastMove!.captured)).toEqual(['C2']);
  });

  it('wählt die beste Kombination: 2. Kreuz, 3. Anzahl, 4. Tischreihenfolge', () => {
    const cases: Array<[string, string, string[]]> = [
      ['H9 C6 C3', 'S2', ['C3', 'C6']], // mehr Kreuz
      ['H9 D6 S3', 'S2', ['S3', 'D6']], // mehr Karten
      ['SK HK', 'CK', ['HK']], // Tischreihenfolge (Herz vor Pik)
    ];
    for (const [table, played, expected] of cases) {
      const { state, ctx } = turnState(['C3', played], table);
      const pending = ok(applyAction(state, { type: 'playCard', seat: 1, cardId: played }, ctx));
      expect(pending.round.phase).toBe('choosingCapture');
      const next = advanceTime(pending, { now: pending.round.deadline!, rng: forbiddenRng }).state;
      expect(ids(next.round.lastMove!.captured)).toEqual(expected);
    }
  });
});

describe('Bube', () => {
  const playJack = (table: string) => {
    const { state, ctx } = turnState(['C3', 'HJ S5'], table);
    return ok(applyAction(state, { type: 'playCard', seat: 1, cardId: 'HJ' }, ctx));
  };

  it('nimmt automatisch alle Zahlenkarten', () => {
    const next = playJack('SA C4 D7 H10');
    expect(next.round.phase).toBe('moveAnimation');
    expect(ids(next.round.lastMove!.captured)).toEqual(['SA', 'C4', 'D7', 'H10']);
    expect(next.round.table).toEqual([]);
  });

  it('nimmt automatisch alle bereits liegenden Buben', () => {
    const next = playJack('CJ DJ');
    expect(ids(next.round.lastMove!.captured)).toEqual(['CJ', 'DJ']);
  });

  it('nimmt Zahlenkarten UND liegende Buben gemeinsam (Beispiel 3, 7, Bube, Dame, König)', () => {
    const next = playJack('S3 D7 CJ HQ SK');
    expect(ids(next.round.lastMove!.captured)).toEqual(['S3', 'D7', 'CJ']);
    expect(ids(next.round.captured.seat1!)).toEqual(['HJ', 'S3', 'D7', 'CJ']);
  });

  it('lässt Damen und Könige liegen', () => {
    const next = playJack('C5 DQ HQ CK');
    expect(ids(next.round.table)).toEqual(['DQ', 'HQ', 'CK']);
  });

  it('bleibt auf dem Tisch, wenn nichts aufnehmbar ist', () => {
    expect(ids(playJack('DQ SK').round.table)).toEqual(['HJ', 'DQ', 'SK']);
    expect(ids(playJack('').round.table)).toEqual(['HJ']);
    expect(playJack('').round.lastMove!.captured).toEqual([]);
  });

  it('hat nie eine manuelle Auswahl – auch bei vielen Karten', () => {
    const next = playJack('SA H2 C3 D4 S5 H6 C7 D8 S9 H10 CJ');
    expect(next.round.phase).toBe('moveAnimation');
    expect(next.round.pending).toBeNull();
    expect(next.round.lastMove!.captured).toHaveLength(11);
  });

  it('ein liegengebliebener Bube wird später von einem weiteren Buben aufgenommen', () => {
    const { state, ctx } = turnState(['DJ S2', 'HJ S5'], 'DQ');
    let next = ok(applyAction(state, { type: 'playCard', seat: 1, cardId: 'HJ' }, ctx));
    expect(ids(next.round.table)).toEqual(['HJ', 'DQ']);
    next = advanceTime(next, { ...ctx, now: next.round.deadline! }).state; // Animation -> Sitz 0 am Zug
    expect(next.round.currentSeat).toBe(0);
    next = ok(applyAction(next, { type: 'playCard', seat: 0, cardId: 'DJ' }, ctx));
    expect(ids(next.round.lastMove!.captured)).toEqual(['HJ']);
    expect(ids(next.round.table)).toEqual(['DQ']);
  });
});

describe('Timer starten erst nach der relevanten Animation', () => {
  it('Zugtimer des nächsten Spielers startet erst nach der Zuganimation', () => {
    const { state, ctx } = turnState(['C3 D4', 'H2 S5'], 'S9 HK');
    const playedAt = ctx.now + 2500;
    const moved = ok(applyAction(state, { type: 'playCard', seat: 1, cardId: 'H2' }, { ...ctx, now: playedAt }));
    expect(moved.round.phase).toBe('moveAnimation');
    expect(moved.round.deadline).toBe(playedAt + moved.timings.moveAnimationMs);
    const during = advanceTime(moved, { ...ctx, now: moved.round.deadline! - 1 });
    expect(during.changed).toBe(false);
    expect(during.state.round.phase).toBe('moveAnimation');
    const next = advanceTime(moved, { ...ctx, now: moved.round.deadline! }).state;
    expect(next.round.phase).toBe('turn');
    expect(next.round.currentSeat).toBe(0);
    expect(next.round.phaseStartedAt).toBe(moved.round.deadline);
    expect(next.round.deadline).toBe(moved.round.deadline! + next.timings.turnMs); // volle 10 s
  });

  it('erster Zug startet erst nach der Austeil-Animation', () => {
    const { state, ctx } = afterCut();
    const dealing = ok(applyAction(state, { type: 'chooseDealOrder', seat: 1, order: 'playersFirst' }, ctx));
    expect(dealing.round.phase).toBe('dealing');
    const turn = advanceTime(dealing, { ...ctx, now: dealing.round.deadline! }).state;
    expect(turn.round.phase).toBe('turn');
    expect(turn.round.deadline).toBe(dealing.round.deadline! + turn.timings.turnMs);
  });

  it('7-s-Wahl startet erst nach der Schnitt-Animation; während der Animation ist keine Wahl möglich', () => {
    const ctx: EngineContext = { now: 0, rng: createSeededRng(3) };
    let { state } = createMatch({ playerCount: 3, firstDealerSeat: 0 }, ctx);
    ctx.now = state.round.deadline!;
    state = advanceTime(state, ctx).state;
    state = ok(applyAction(state, { type: 'cut', seat: 1, index: 20 }, ctx));
    expect(state.round.phase).toBe('cutReveal');
    expect(state.round.deadline).toBe(ctx.now + state.timings.cutRevealMs);
    expect(applyAction(state, { type: 'chooseDealOrder', seat: 1, order: 'tableFirst' }, ctx).ok).toBe(false);
    const choosing = advanceTime(state, { ...ctx, now: state.round.deadline! }).state;
    expect(choosing.round.phase).toBe('choosingDealOrder');
    expect(choosing.round.deadline).toBe(state.round.deadline! + 7000);
  });

  it('Kombinationsauswahl: Zeitpunkt des Ausspielens wird vermerkt, die Zug-Deadline bleibt unverändert', () => {
    const { state, ctx } = turnState(['C3', 'H2 S5'], 'S9 C6 D3');
    const pending = ok(applyAction(state, { type: 'playCard', seat: 1, cardId: 'H2' }, { ...ctx, now: ctx.now + 4000 }));
    expect(pending.round.phaseStartedAt).toBe(ctx.now + 4000);
    expect(pending.round.deadline).toBe(state.round.deadline);
    const taken = ok(applyAction(pending, { type: 'chooseCapture', seat: 1, cardIds: ['S9'] }, { ...ctx, now: ctx.now + 5000 }));
    expect(taken.round.lastMove!.viaChoice).toBe(true);
  });
});
