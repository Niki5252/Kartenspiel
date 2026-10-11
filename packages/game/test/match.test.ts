import { describe, expect, it } from 'vitest';
import {
  type Card,
  type EngineContext,
  type MatchState,
  type PlayerCount,
  applyAction,
  advanceTime,
  autoActionFor,
  createMatch,
  createSeededRng,
  isJack,
  projectMatchView,
} from '../src';

function allCards(state: MatchState): Card[] {
  const r = state.round;
  return [...r.deck, ...r.table, ...r.hands.flat(), ...Object.values(r.captured).flat(), ...(r.pending ? [r.pending.card] : [])];
}

/** Zeit bis zur nächsten Deadline vorspulen. */
function skip(state: MatchState, ctx: EngineContext): MatchState {
  const deadline = state.round.deadline;
  if (deadline === null) throw new Error('keine Deadline');
  ctx.now = deadline;
  return advanceTime(state, ctx).state;
}

function setup(playerCount: PlayerCount, seed = 7) {
  const ctx: EngineContext = { now: 1_000, rng: createSeededRng(seed) };
  const { state } = createMatch({ playerCount, firstDealerSeat: 0 }, ctx);
  return { ctx, state };
}

function act(state: MatchState, action: Parameters<typeof applyAction>[1], ctx: EngineContext): MatchState {
  const r = applyAction(state, action, ctx);
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

describe('Rundenablauf', () => {
  it('Mischen -> Schneiden -> Wahl -> Austeilen -> erster Zug rechts vom Dealer', () => {
    let { ctx, state } = setup(4);
    expect(state.round.phase).toBe('shuffling');
    state = skip(state, ctx);
    expect(state.round.phase).toBe('cutting');
    expect(state.round.deadline! - ctx.now).toBe(7000);

    // Nur Sitz 1 (rechts vom Dealer 0) darf schneiden
    expect(applyAction(state, { type: 'cut', seat: 2, index: 10 }, ctx).ok).toBe(false);
    const deckBefore = state.round.deck;
    state = act(state, { type: 'cut', seat: 1, index: 10 }, ctx);
    expect(state.round.cut?.revealedCard).toEqual(deckBefore[9]);
    expect(state.round.deck.at(-1)).toEqual(deckBefore[9]);
    expect(state.round.phase).toBe('choosingDealOrder');

    state = act(state, { type: 'chooseDealOrder', seat: 1, order: 'playersFirst' }, ctx);
    expect(state.round.phase).toBe('dealing');
    expect(state.round.hands.map((h) => h.length)).toEqual([4, 4, 4, 4]);
    expect(state.round.table).toHaveLength(4);
    expect(state.round.table.some(isJack)).toBe(false);
    expect(state.round.deck).toHaveLength(52 - 20);
    // Spieler zuerst: Sitz 1 erhält die obersten 4 Karten
    expect(state.round.hands[1]).toEqual(deckAfterCut(deckBefore, 10).slice(0, 4));

    state = skip(state, ctx);
    expect(state.round.phase).toBe('turn');
    expect(state.round.currentSeat).toBe(1);
  });

  it('Tisch zuerst: die obersten Karten gehen auf den Tisch', () => {
    let { ctx, state } = setup(2, 3);
    state = skip(state, ctx);
    const cutDeck = deckAfterCut(state.round.deck, 5);
    state = act(state, { type: 'cut', seat: 1, index: 5 }, ctx);
    state = act(state, { type: 'chooseDealOrder', seat: 1, order: 'tableFirst' }, ctx);
    const firstNonJacks = cutDeck.filter((c) => !isJack(c)).slice(0, 4);
    expect([...state.round.table].map((c) => c.id).sort()).toEqual(firstNonJacks.map((c) => c.id).sort());
  });

  it('Schneide-Timeout wählt automatisch eine gültige Schnittstelle', () => {
    let { ctx, state } = setup(3);
    state = skip(state, ctx);
    state = skip(state, ctx);
    expect(state.round.phase).toBe('choosingDealOrder');
    expect(state.round.cut?.auto).toBe(true);
  });

  it('Nur der aktive Spieler darf spielen; Timeout spielt eine Handkarte zufällig', () => {
    let { ctx, state } = setup(2);
    state = skip(state, ctx);
    state = act(state, { type: 'cut', seat: 1, index: 20 }, ctx);
    state = act(state, { type: 'chooseDealOrder', seat: 1, order: 'playersFirst' }, ctx);
    state = skip(state, ctx);
    const hand = state.round.hands[1]!;
    expect(applyAction(state, { type: 'playCard', seat: 0, cardId: state.round.hands[0]![0]!.id }, ctx).ok).toBe(false);
    state = skip(state, ctx); // Timeout
    expect(state.round.phase).toBe('moveAnimation');
    expect(state.round.lastMove?.byTimeout).toBe(true);
    expect(hand.map((c) => c.id)).toContain(state.round.lastMove!.card.id);
    expect(state.round.hands[1]).toHaveLength(3);
    state = skip(state, ctx);
    expect(state.round.currentSeat).toBe(0);
  });
});

describe('Komplette Matches (Simulation)', () => {
  for (const playerCount of [2, 3, 4] as const) {
    it(`${playerCount} Spieler: Invarianten über ein ganzes Match`, () => {
      let { ctx, state } = setup(playerCount, 100 + playerCount);
      let rounds = 0;
      let lastDealer = state.round.dealerSeat;
      let lastRound = state.round.number;
      let guard = 0;

      while (state.status === 'running' && guard++ < 20_000) {
        expect(allCards(state)).toHaveLength(52);
        expect(new Set(allCards(state).map((c) => c.id)).size).toBe(52);

        if (state.round.number !== lastRound) {
          // Dealer wandert genau einen Sitz nach rechts
          expect(state.round.dealerSeat).toBe((lastDealer + 1) % playerCount);
          lastDealer = state.round.dealerSeat;
          lastRound = state.round.number;
        }

        // Manche Züge per Aktion, manche per Timeout
        let acted = false;
        if (guard % 3 !== 0) {
          for (let seat = 0; seat < playerCount && !acted; seat++) {
            const action = autoActionFor(state, seat, ctx.rng);
            if (action) {
              state = act(state, action, ctx);
              acted = true;
            }
          }
        }
        if (!acted) {
          if (state.round.phase === 'choosingDealOrder') {
            state = act(state, { type: 'chooseDealOrder', seat: (state.round.dealerSeat + 1) % playerCount, order: 'tableFirst' }, ctx);
          } else {
            state = skip(state, ctx);
          }
        }

        if (state.round.phase === 'roundSummary' && state.round.result) {
          const total = state.round.result.score.stats.reduce((s, x) => s + x.points, 0);
          expect(total).toBeLessThanOrEqual(5);
          expect(state.round.table).toHaveLength(0);
          if (state.status === 'running') {
            rounds++;
          }
        }
      }

      expect(state.status).toBe('finished');
      expect(state.winner).not.toBeNull();
      const winnerScore = state.scores[state.winner!]!;
      expect(winnerScore).toBeGreaterThanOrEqual(11);
      for (const [id, score] of Object.entries(state.scores)) if (id !== state.winner) expect(score).toBeLessThan(winnerScore);
      expect(rounds).toBeGreaterThan(0);
    });
  }

  it('Der Dealer erhält die beim Schneiden gezeigte Karte', () => {
    let { ctx, state } = setup(3, 11);
    state = skip(state, ctx);
    state = act(state, { type: 'cut', seat: 1, index: 17 }, ctx);
    const revealed = state.round.cut!.revealedCard;
    state = act(state, { type: 'chooseDealOrder', seat: 1, order: 'playersFirst' }, ctx);
    let sawRevealedWithDealer = false;
    let guard = 0;
    while (state.round.phase !== 'roundSummary' && guard++ < 1000) {
      if (state.round.hands[state.round.dealerSeat]!.some((c) => c.id === revealed.id)) sawRevealedWithDealer = true;
      state = skip(state, ctx);
    }
    expect(sawRevealedWithDealer).toBe(true);
  });
});

describe('Spieler-Sicht', () => {
  it('überträgt keine fremden Handkarten und keine Deck-Reihenfolge', () => {
    let { ctx, state } = setup(4);
    state = skip(state, ctx);
    state = act(state, { type: 'cut', seat: 1, index: 9 }, ctx);
    state = act(state, { type: 'chooseDealOrder', seat: 1, order: 'playersFirst' }, ctx);
    const view = projectMatchView(state, 2);
    const json = JSON.stringify(view);
    expect(view.myHand).toEqual(state.round.hands[2]);
    for (const seat of [0, 1, 3]) for (const c of state.round.hands[seat]!) expect(json).not.toContain(`"${c.id}"`);
    expect(view.round.handCounts).toEqual([4, 4, 4, 4]);
    expect('deck' in view.round).toBe(false);
  });
});

function deckAfterCut(deck: readonly Card[], index: number): Card[] {
  return [...deck.slice(index), ...deck.slice(0, index)];
}
