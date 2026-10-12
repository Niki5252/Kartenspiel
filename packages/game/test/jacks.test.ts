/**
 * Buben beim ersten Tisch-Aufdecken: ans Deckende, tatsächliche letzte Karte, Dealer erhält sie, Ersatzkarten.
 */
import { describe, expect, it } from 'vitest';
import {
  type Card,
  type DealOrder,
  type EngineContext,
  type MatchState,
  type PlayerCount,
  RANK_LABEL,
  advanceTime,
  applyAction,
  createDeck,
  createMatch,
  createSeededRng,
  dealDuration,
  isJack,
  parseCardId,
  projectMatchView,
} from '../src';

/** Deck (nach dem Schneiden) mit festgelegten obersten Karten und festgelegter unterster Karte (= Schnittkarte). */
function deckWith(top: string[], bottom: string): Card[] {
  const fixed = new Set([...top, bottom]);
  const rest = createDeck().filter((c) => !fixed.has(c.id));
  return [...top.map((id) => parseCardId(id)!), ...rest, parseCardId(bottom)!];
}

function choosing(playerCount: PlayerCount, deck: Card[]): { state: MatchState; ctx: EngineContext } {
  const ctx: EngineContext = { now: 1000, rng: createSeededRng(9) };
  const { state } = createMatch({ playerCount, firstDealerSeat: 0 }, ctx);
  const r = state.round;
  r.phase = 'choosingDealOrder';
  r.deadline = ctx.now + 7000;
  r.deck = deck;
  r.cut = { index: 20, revealedCard: deck[deck.length - 1]!, auto: false };
  return { state, ctx };
}

function deal(playerCount: PlayerCount, deck: Card[], order: DealOrder = 'tableFirst') {
  const { state, ctx } = choosing(playerCount, deck);
  const r = applyAction(state, { type: 'chooseDealOrder', seat: 1, order }, ctx);
  if (!r.ok) throw new Error(r.error);
  return { state: r.state, ctx };
}

const ids = (cards: readonly Card[]) => cards.map((c) => c.id);

/** Spielt (per Timeout) bis zum letzten Austeilen und liefert die Hand des Dealers danach. */
function dealerHandAtLastDeal(state: MatchState, ctx: EngineContext): Card[] {
  let s = state;
  for (let i = 0; i < 2000; i++) {
    if (s.round.deck.length === 0 && s.round.phase === 'dealing') return s.round.hands[s.round.dealerSeat]!;
    ctx.now = s.round.deadline!;
    s = advanceTime(s, ctx).state;
  }
  throw new Error('letztes Austeilen nicht erreicht');
}

describe('Ein Bube beim ersten Tisch-Aufdecken', () => {
  const deck = deckWith(['C5', 'HJ', 'D7', 'C9', 'H3'], 'SK');

  it('Bube kommt ans Deckende, Ersatzkarte wird aufgedeckt, vier gültige Tischkarten', () => {
    const { state } = deal(3, deck);
    expect(ids(state.round.table).sort()).toEqual(['C5', 'C9', 'D7', 'H3'].sort());
    expect(state.round.table.some(isJack)).toBe(false);
    expect(ids(state.round.initialMovedJacks)).toEqual(['HJ']);
    expect(ids(state.round.initialReveal)).toEqual(['C5', 'HJ', 'D7', 'C9', 'H3']);
    expect(state.round.deck.at(-1)!.id).toBe('HJ');
    expect(state.round.deck.at(-2)!.id).toBe('SK'); // Schnittkarte liegt jetzt darüber
  });

  it('tatsächliche letzte Karte ist der Bube – die Schnittkarte wird nicht mehr angezeigt', () => {
    const { state } = choosing(3, deck);
    expect(projectMatchView(state, 0).round.deckBottom?.id).toBe('SK'); // vor dem Aufdecken
    const dealt = deal(3, deck).state;
    const view = projectMatchView(dealt, 0);
    expect(view.round.deckBottom?.id).toBe('HJ');
    expect(view.round.deckBottom?.id).not.toBe(view.round.cut!.revealedCard.id);
  });

  it('der Dealer erhält den Buben später tatsächlich', () => {
    const { state, ctx } = deal(3, deck);
    expect(ids(dealerHandAtLastDeal(state, ctx))).toContain('HJ');
  });

  it('Austeilphase ist um die Buben-Darstellung länger', () => {
    const { state, ctx } = deal(3, deck);
    expect(state.round.deadline! - ctx.now).toBe(dealDuration(state.timings, true, 1));
    expect(dealDuration(state.timings, true, 1) - dealDuration(state.timings, true, 0)).toBe(state.timings.jackRevealMs);
  });
});

describe('Mehrere Buben beim ersten Tisch-Aufdecken', () => {
  const cases: Array<[string, string[], string[], string[]]> = [
    // [Name, oberste Karten, erwartete Buben-Reihenfolge, erwartete Tischkarten]
    ['zwei', ['CJ', 'H4', 'HJ', 'S6', 'D8', 'C2'], ['CJ', 'HJ'], ['H4', 'S6', 'D8', 'C2']],
    ['drei', ['CJ', 'HJ', 'H4', 'SJ', 'S6', 'D8', 'C2'], ['CJ', 'HJ', 'SJ'], ['H4', 'S6', 'D8', 'C2']],
    ['vier', ['DJ', 'H4', 'CJ', 'HJ', 'S6', 'SJ', 'D8', 'C2'], ['DJ', 'CJ', 'HJ', 'SJ'], ['H4', 'S6', 'D8', 'C2']],
  ];

  for (const [name, top, jacks, table] of cases) {
    it(`${name} Buben: Reihenfolge am Deckende, letzte Karte, Ersatzkarten, Dealer erhält sie`, () => {
      for (const [n, order] of [[2, 'tableFirst'], [3, 'tableFirst'], [4, 'tableFirst']] as const) {
        const deck = deckWith(top, 'SK');
        const { state, ctx } = deal(n, deck, order);
        expect(ids(state.round.initialMovedJacks)).toEqual(jacks);
        // Deckende exakt: ..., Schnittkarte, Bube1, Bube2, ...
        expect(ids(state.round.deck.slice(-(jacks.length + 1)))).toEqual(['SK', ...jacks]);
        expect(projectMatchView(state, 0).round.deckBottom?.id).toBe(jacks.at(-1));
        expect(ids(state.round.table).sort()).toEqual([...table].sort());
        expect(state.round.table).toHaveLength(4);
        expect(state.round.table.some(isJack)).toBe(false);
        const dealerHand = ids(dealerHandAtLastDeal(state, ctx));
        for (const j of jacks) expect(dealerHand).toContain(j);
      }
    });
  }

  it('auch bei "Spieler zuerst": Tischkarten nach den Paketen, Buben ans Deckende', () => {
    // Bei Spieler zuerst werden zuerst 3×4 Karten verteilt, dann wird der Tisch aufgedeckt.
    const top = [...'C2 C3 C4 C5 C6 C7 C8 C9 D2 D3 D4 D5'.split(' '), 'HJ', 'H2', 'SJ', 'H3', 'H4', 'H5'];
    const { state } = deal(3, deckWith(top, 'SK'), 'playersFirst');
    expect(ids(state.round.initialMovedJacks)).toEqual(['HJ', 'SJ']);
    expect(ids(state.round.table).sort()).toEqual(['H2', 'H3', 'H4', 'H5'].sort());
    expect(state.round.deck.at(-1)!.id).toBe('SJ');
  });
});

describe('Kartenbezeichnungen', () => {
  it('Bube = J, Dame = Q, König = K (nur Darstellung)', () => {
    expect(RANK_LABEL[11]).toBe('J');
    expect(RANK_LABEL[12]).toBe('Q');
    expect(RANK_LABEL[13]).toBe('K');
    expect(Object.values(RANK_LABEL)).not.toContain('B');
    expect(Object.values(RANK_LABEL)).not.toContain('D');
  });
});

describe('Rundenauswertung 12 s + 5 s = 17 s', () => {
  it('bleibt exakt 17 s, erst danach startet die nächste Runde', () => {
    const ctx: EngineContext = { now: 0, rng: createSeededRng(21) };
    let state = createMatch({ playerCount: 2, firstDealerSeat: 0 }, ctx).state;
    expect(state.timings.roundSummaryMs).toBe(17_000);
    for (let i = 0; i < 3000 && state.round.phase !== 'roundSummary'; i++) {
      ctx.now = state.round.deadline!;
      state = advanceTime(state, ctx).state;
    }
    expect(state.round.phase).toBe('roundSummary');
    if (state.status === 'finished') return;
    const start = state.round.phaseStartedAt;
    expect(state.round.deadline).toBe(start + 17_000);
    const before = advanceTime(state, { ...ctx, now: start + 16_999 });
    expect(before.changed).toBe(false);
    expect(before.state.round.phase).toBe('roundSummary');
    const after = advanceTime(state, { ...ctx, now: start + 17_000 }).state;
    expect(after.round.number).toBe(2);
    expect(after.round.phase).toBe('shuffling');
    // Alle Clients sehen dieselbe Phase und Deadline
    const views = [0, 1, null].map((seat) => projectMatchView(state, seat).round);
    for (const v of views) expect([v.phase, v.phaseStartedAt, v.deadline]).toEqual(['roundSummary', start, start + 17_000]);
  });
});
