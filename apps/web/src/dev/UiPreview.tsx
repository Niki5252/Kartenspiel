/**
 * Dev-Vorschau (nur Development-Build): echter Spieltisch mit festen Testsituationen, ohne Server.
 * Aufruf: /dev/ui?scenario=capture | myturn | otherturn | mycut
 * Aktionen werden nicht gesendet (kein Raum) – dient nur der visuellen Prüfung.
 */
import { type MatchState, createDeck, createMatch, createSeededRng, dealDuration, parseCardId, projectMatchView, scoreRound, sortTable } from '@orlan/game';
import type { PlayerPublic, RoomView } from '@orlan/protocol';
import { useMemo } from 'react';
import { serverNow } from '../net/client';
import { GameScreen } from '../screens/GameScreen';

const cards = (ids: string) => ids.split(' ').filter(Boolean).map((id) => parseCardId(id)!);

function build(scenario: string, playerCount: 2 | 3 | 4, opts: { jacks: number; me: number; winner: string | null }): RoomView {
  const now = serverNow();
  const { state } = createMatch({ playerCount, firstDealerSeat: 0 }, { now, rng: createSeededRng(7) });
  const r = state.round;
  r.deck = cards('C4 C5 C7 C8 D5 D6 D7 D8 H3 H6 H7 H8 S3 S6 S7 S8 SA DA HA CA');
  r.dealsDone = 1;
  r.cut = { index: 18, revealedCard: parseCardId('H4')!, auto: false };
  const setTurn = (seat: number) => {
    r.phase = 'turn';
    r.currentSeat = seat;
    r.phaseStartedAt = now - 6000;
    r.deadline = now + state.timings.turnMs - 6000;
  };
  r.hands = Array.from({ length: playerCount }, () => cards('SK DQ C10'));
  r.hands[0] = cards('D2 S10 HK CQ');
  r.table = sortTable(cards('H9 C9 C6 D3 H5 S4 SQ'));
  // Gesammelte Karten je Seite (unterschiedlich viele, damit die Haufen-Dicke sichtbar ist)
  const pool = cards('C2 C3 D9 D10 DJ DK H2 H10 HJ HQ S2 S5 S9 SJ CJ CK S3 S6 S7 S8 H3 H6 H7 H8 C4 C5 C7 C8 D5 D6 D7 D8');
  const amounts = [22, 3, 9, 0];
  let offset = 0;
  state.sides.forEach((side, i) => {
    const n = Math.min(amounts[i] ?? 0, pool.length - offset);
    r.captured[side.id] = pool.slice(offset, offset + n);
    offset += n;
  });
  switch (scenario) {
    case 'jacks': {
      // Erstes Austeilen (Tisch zuerst) mit 1–4 Buben beim Aufdecken
      const jackIds = ['CJ', 'HJ', 'SJ', 'DJ'].slice(0, Math.max(1, Math.min(4, opts.jacks)));
      const normal = ['H4', 'S6', 'D8', 'C2'];
      const reveal = [jackIds[0]!, normal[0]!, ...jackIds.slice(1), ...normal.slice(1)];
      const used = new Set([...reveal, 'SK']);
      const rest = createDeck().filter((c) => !used.has(c.id));
      r.phase = 'dealing';
      r.dealsDone = 1;
      r.dealOrder = 'tableFirst';
      r.cut = { index: 18, revealedCard: parseCardId('SK')!, auto: false };
      r.initialReveal = cards(reveal.join(' '));
      r.initialMovedJacks = cards(jackIds.join(' '));
      r.table = sortTable(cards(normal.join(' ')));
      r.hands = Array.from({ length: playerCount }, (_, i) => rest.slice(i * 4, i * 4 + 4));
      r.deck = [...rest.slice(playerCount * 4), parseCardId('SK')!, ...r.initialMovedJacks];
      r.phaseStartedAt = now;
      r.deadline = now + dealDuration(state.timings, true, jackIds.length);
      r.currentSeat = 1 % playerCount;
      for (const side of state.sides) r.captured[side.id] = [];
      break;
    }
    case 'end': {
      // Matchende aus Sicht von Sitz `me`, Gewinnerseite `winner`
      r.phase = 'roundSummary';
      r.deadline = null;
      const sideIds = state.sides.map((x) => x.id);
      const winner = opts.winner ?? sideIds[0]!;
      state.scores = Object.fromEntries(sideIds.map((id) => [id, id === winner ? 12 : 8]));
      r.result = {
        roundNumber: 6,
        dealerSeat: 0,
        score: scoreRound(sideIds, r.captured),
        leftoverCards: [],
        leftoverSide: null,
        scoresAfter: { ...state.scores },
      };
      state.status = 'finished';
      state.winner = winner;
      break;
    }
    case 'fulltable':
      setTurn(0);
      r.table = sortTable(cards('HA SA C3 D4 H5 C6 S7 D8 H10 CQ DK SK'));
      break;
    case 'capture':
      setTurn(0);
      r.phase = 'choosingCapture';
      r.hands[0] = cards('S10 HK CQ');
      r.pending = {
        seat: 0,
        card: parseCardId('D2')!,
        options: [['C9'], ['H9'], ['D3', 'C6'], ['S4', 'H5']],
      };
      r.phaseStartedAt = now - 5000; // Karte liegt bereits in der Mitte
      break;
    case 'otherturn':
      setTurn(1);
      break;
    case 'mycut':
      r.phase = 'cutting';
      r.cut = null;
      r.dealsDone = 0;
      r.table = [];
      r.hands = r.hands.map(() => []);
      r.deck = [...r.deck, ...cards('C2 C3 D9 D10 DJ DK H2 H10 HJ HQ S2 S5 S9 SJ CJ CK C9 H9 C6 D3 H5 S4 SQ D2 S10 HK CQ SK DQ C10 D4 H4')];
      r.currentSeat = 1;
      r.phaseStartedAt = now - 2000;
      r.deadline = now + state.timings.cutMs - 2000;
      r.dealerSeat = playerCount - 1; // ich (Sitz 0) bin rechts vom Dealer
      break;
    default:
      setTurn(0);
  }
  return toView(state, opts.me);
}

function toView(state: MatchState, viewerSeat: number): RoomView {
  const names = new URLSearchParams(window.location.search).get('long')
    ? ['Nikola-Alexander', 'Gabriel Maximilian', 'Anastasia-Marie', 'Lea-Sophie Katharina']
    : ['Nikola', 'Ana', 'Marko', 'Lea'];
  const players: PlayerPublic[] = Array.from({ length: state.playerCount }, (_, seat) => ({
    id: `p${seat}`, name: names[seat]!, team: state.playerCount === 4 ? ((seat % 2) + 1 as 1 | 2) : null,
    ready: true, connected: true, everConnected: true, isHost: seat === 0, isBot: false, seat,
  }));
  return {
    code: 'DEVUI1', maxPlayers: state.playerCount, status: 'playing', hostId: 'p0', myPlayerId: `p${viewerSeat}`, players,
    seats: players.map((p) => p.id), seatPlan: null, countdownEndsAt: null, startBlockers: [], match: projectMatchView(state, viewerSeat),
    isDevRoom: true, serverNow: serverNow(), notice: null,
  };
}

export function UiPreview() {
  const params = new URLSearchParams(window.location.search);
  const scenario = params.get('scenario') ?? 'myturn';
  const players = Number(params.get('players') ?? 2) as 2 | 3 | 4;
  const opts = { jacks: Number(params.get('jacks') ?? 1), me: Number(params.get('me') ?? 0), winner: params.get('winner') };
  const view = useMemo(() => build(scenario, players, opts), [scenario, players, opts.jacks, opts.me, opts.winner]);
  return <GameScreen view={view} />;
}
