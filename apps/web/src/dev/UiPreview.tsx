/**
 * Dev-Vorschau (nur Development-Build): echter Spieltisch mit festen Testsituationen, ohne Server.
 * Aufruf: /dev/ui?scenario=capture | myturn | otherturn | mycut
 * Aktionen werden nicht gesendet (kein Raum) – dient nur der visuellen Prüfung.
 */
import { type MatchState, createMatch, createSeededRng, parseCardId, projectMatchView, sortTable } from '@orlan/game';
import type { PlayerPublic, RoomView } from '@orlan/protocol';
import { useMemo } from 'react';
import { serverNow } from '../net/client';
import { GameScreen } from '../screens/GameScreen';

const cards = (ids: string) => ids.split(' ').filter(Boolean).map((id) => parseCardId(id)!);

function build(scenario: string, playerCount: 2 | 3 | 4): RoomView {
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
  switch (scenario) {
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
  return toView(state, 0);
}

function toView(state: MatchState, viewerSeat: number): RoomView {
  const names = ['Nikola', 'Ana', 'Marko', 'Lea'];
  const players: PlayerPublic[] = Array.from({ length: state.playerCount }, (_, seat) => ({
    id: `p${seat}`, name: names[seat]!, team: state.playerCount === 4 ? ((seat % 2) + 1 as 1 | 2) : null,
    ready: true, connected: true, everConnected: true, isHost: seat === 0, isBot: false, seat,
  }));
  return {
    code: 'DEVUI1', maxPlayers: state.playerCount, status: 'playing', hostId: 'p0', myPlayerId: `p${viewerSeat}`, players,
    seats: players.map((p) => p.id), countdownEndsAt: null, startBlockers: [], match: projectMatchView(state, viewerSeat),
    isDevRoom: true, serverNow: serverNow(), notice: null,
  };
}

export function UiPreview() {
  const params = new URLSearchParams(window.location.search);
  const scenario = params.get('scenario') ?? 'myturn';
  const players = Number(params.get('players') ?? 2) as 2 | 3 | 4;
  const view = useMemo(() => build(scenario, players), [scenario, players]);
  return <GameScreen view={view} />;
}
