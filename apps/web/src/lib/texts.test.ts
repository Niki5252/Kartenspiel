import {
  type Card,
  type DealOrder,
  type MatchState,
  type PlayerCount,
  RANKS,
  SUITS,
  applyAction,
  createDeck,
  createMatch,
  createSeededRng,
  makeCard,
  parseCardId,
  projectMatchView,
} from '@orlan/game';
import type { PlayerPublic, RoomView } from '@orlan/protocol';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { dealPlan, visibleDeckBottom, visibleJackNotice } from '../anim/timeline';
import { CardLabel } from '../components/CardLabel';
import { PlayingCard } from '../components/PlayingCard';
import { shortCard } from './display';
import { jackNoticeText, joinGerman, matchEndText } from './texts';

const NAMES = ['Nikola', 'Gabriel', 'Ana', 'Lea-Marie Sophie'];
const card = (id: string) => parseCardId(id)!;

function roomView(state: MatchState, viewerSeat: number | null): RoomView {
  const players: PlayerPublic[] = Array.from({ length: state.playerCount }, (_, seat) => ({
    id: `p${seat}`, name: NAMES[seat]!, team: null, ready: true, connected: true, everConnected: true, isHost: seat === 0, isBot: false, seat,
  }));
  return {
    code: 'X', maxPlayers: state.playerCount, status: 'playing', hostId: 'p0', myPlayerId: viewerSeat === null ? 'x' : `p${viewerSeat}`,
    players, seats: players.map((p) => p.id), seatPlan: null, countdownEndsAt: null, startBlockers: [],
    match: projectMatchView(state, viewerSeat), isDevRoom: false, serverNow: 0, notice: null,
  };
}

describe('Kartenbezeichnungen in allen Darstellungen', () => {
  const all = SUITS.flatMap((s) => RANKS.map((r) => makeCard(s, r)));
  const rankTexts = (html: string) => [...html.matchAll(/class="(?:card__rank|mini-card__rank)">([^<]+)</g)].map((m) => m[1]);

  it('große Karten und Mini-Karten zeigen J/Q/K – nie B oder D', () => {
    const shown = new Set<string>();
    for (const c of all) {
      for (const el of [createElement(PlayingCard, { card: c }), createElement(CardLabel, { card: c })]) {
        for (const t of rankTexts(renderToStaticMarkup(el))) shown.add(t!);
      }
    }
    expect([...shown].sort()).toEqual(['10', '2', '3', '4', '5', '6', '7', '8', '9', 'A', 'J', 'K', 'Q'].sort());
    expect(shown.has('B')).toBe(false);
    expect(shown.has('D')).toBe(false);
  });

  it('Texte (Zuganzeige, Meldungen) verwenden J/Q/K', () => {
    expect(shortCard(card('CJ'))).toBe('J♣');
    expect(shortCard(card('HQ'))).toBe('Q♥');
    expect(shortCard(card('SK'))).toBe('K♠');
    // interne IDs bleiben unverändert
    expect(card('CJ')).toMatchObject({ id: 'CJ', rank: 11, suit: 'clubs' });
  });
});

describe('Buben-Meldung', () => {
  it('1 bis 4 Buben, grammatikalisch korrekt', () => {
    expect(jackNoticeText([card('CJ')])).toBe('J♣ wurde aufgedeckt und ans Ende des Decks gelegt. Der Dealer erhält diese Karte am Schluss.');
    expect(jackNoticeText([card('CJ'), card('HJ')])).toBe(
      'J♣ und J♥ wurden aufgedeckt und ans Ende des Decks gelegt. Der Dealer erhält diese Karten am Schluss.',
    );
    expect(jackNoticeText([card('CJ'), card('HJ'), card('SJ')])).toBe(
      'J♣, J♥ und J♠ wurden aufgedeckt und ans Ende des Decks gelegt. Der Dealer erhält diese Karten am Schluss.',
    );
    expect(jackNoticeText(['CJ', 'DJ', 'HJ', 'SJ'].map(card))).toBe(
      'J♣, J♦, J♥ und J♠ wurden aufgedeckt und ans Ende des Decks gelegt. Der Dealer erhält diese Karten am Schluss.',
    );
    expect(joinGerman(['A'])).toBe('A');
  });
});

describe('Anzeige "Letzte Karte" folgt dem echten Deck – auch während der Buben-Animation', () => {
  function dealt(top: string[], order: DealOrder = 'tableFirst', n: PlayerCount = 3) {
    const fixed = new Set([...top, 'SK']);
    const deck = [...top.map(card), ...createDeck().filter((c) => !fixed.has(c.id)), card('SK')];
    const ctx = { now: 1000, rng: createSeededRng(3) };
    const { state } = createMatch({ playerCount: n, firstDealerSeat: 0 }, ctx);
    state.round.phase = 'choosingDealOrder';
    state.round.deck = deck;
    state.round.cut = { index: 20, revealedCard: card('SK'), auto: false };
    const r = applyAction(state, { type: 'chooseDealOrder', seat: 1, order }, ctx);
    if (!r.ok) throw new Error(r.error);
    return r.state;
  }

  it('Schnittkarte -> Bube 1 -> Bube 2 genau beim Unterlegen; danach Serverzustand', () => {
    const state = dealt(['CJ', 'H4', 'DJ', 'S6', 'D8', 'C2']);
    const view = roomView(state, 0);
    const plan = dealPlan(view);
    expect(plan.bottomChanges.map((c) => c.card.id)).toEqual(['CJ', 'DJ']);
    const [first, second] = plan.bottomChanges;
    expect(visibleDeckBottom(view, 0)?.id).toBe('SK');
    expect(visibleDeckBottom(view, first!.at - 1)?.id).toBe('SK');
    expect(visibleDeckBottom(view, first!.at)?.id).toBe('CJ');
    expect(visibleDeckBottom(view, second!.at)?.id).toBe('DJ');
    expect(visibleDeckBottom(view, plan.total)?.id).toBe(view.match!.round.deckBottom!.id);
    // Meldung wächst schrittweise
    expect(visibleJackNotice(view, 0).map((c) => c.id)).toEqual(['CJ']);
    expect(visibleJackNotice(view, plan.total).map((c) => c.id)).toEqual(['CJ', 'DJ']);
    // Buben-Schritte sind deutlich langsamer als normale Karten (für Menschen nachvollziehbar)
    const steps = plan.steps;
    const jackStep = steps.find((s) => s.isJack)!;
    const normalStep = steps.find((s) => !s.isJack)!;
    expect(jackStep.endMs - jackStep.startMs).toBeGreaterThanOrEqual(2000);
    expect(normalStep.endMs - normalStep.startMs).toBeLessThan(400);
  });

  it('ohne Buben bleibt die Schnittkarte die letzte Karte', () => {
    const view = roomView(dealt(['H4', 'S6', 'D8', 'C2']), 0);
    expect(dealPlan(view).bottomChanges).toEqual([]);
    expect(visibleDeckBottom(view, 0)?.id).toBe('SK');
    expect(visibleJackNotice(view, 0)).toEqual([]);
  });
});

describe('Matchende-Texte (perspektivabhängig, echte Namen)', () => {
  function finished(n: PlayerCount, winner: string): MatchState {
    const { state } = createMatch({ playerCount: n, firstDealerSeat: 0 }, { now: 0, rng: createSeededRng(1) });
    state.status = 'finished';
    state.winner = winner;
    return state;
  }

  it('2 Spieler', () => {
    const s = finished(2, 'seat0');
    expect(matchEndText(roomView(s, 0))).toMatchObject({ kind: 'win', text: 'Nikola gewinnt – herzlichen Glückwunsch!' });
    expect(matchEndText(roomView(s, 1))).toMatchObject({ kind: 'lose', text: 'Nikola gewinnt, du bist so schlecht XD!' });
  });

  it('3 Spieler: genau ein Sieger, beide Verlierer sehen den Verlierertext', () => {
    const s = finished(3, 'seat1');
    expect(matchEndText(roomView(s, 1))).toMatchObject({ kind: 'win', text: 'Gabriel gewinnt – herzlichen Glückwunsch!' });
    for (const loser of [0, 2]) expect(matchEndText(roomView(s, loser))!.text).toBe('Gabriel gewinnt, du bist so schlecht XD!');
  });

  it('4 Spieler: beide Namen des Gewinnerteams, keine Teamnummer', () => {
    const s = finished(4, 'team1'); // Sitze 0 und 2: Nikola und Ana
    for (const w of [0, 2]) expect(matchEndText(roomView(s, w))).toMatchObject({ kind: 'win', text: 'Nikola und Ana haben gewonnen!' });
    for (const l of [1, 3]) expect(matchEndText(roomView(s, l))!.text).toBe('Nikola und Ana haben gewonnen, ihr seid so schlecht XD!');
    const s2 = finished(4, 'team2');
    expect(matchEndText(roomView(s2, 0))!.text).toBe('Gabriel und Lea-Marie Sophie haben gewonnen, ihr seid so schlecht XD!');
    for (const seat of [0, 1, 2, 3, null]) expect(matchEndText(roomView(s2, seat))!.text).not.toMatch(/Team/);
  });

  it('kein Text, solange das Match läuft', () => {
    const { state } = createMatch({ playerCount: 2, firstDealerSeat: 0 }, { now: 0, rng: createSeededRng(1) });
    expect(matchEndText(roomView(state, 0))).toBeNull();
  });
});
