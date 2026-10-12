/**
 * Projektion des vollständigen Server-Zustands auf die Sicht eines einzelnen Spielers.
 * Fremde Handkarten und die Deck-Reihenfolge werden NICHT übertragen.
 */
import type { Card } from './cards';
import type { CaptureOption } from './capture';
import {
  type CutInfo,
  type DealOrder,
  type MatchState,
  type MatchStatus,
  type MatchTimings,
  type MoveRecord,
  type RoundPhase,
  type RoundResult,
  cutterSeat,
} from './match';
import type { PlayerCount, SeatIndex, Side, SideId } from './seating';

export interface PendingCaptureView {
  seat: SeatIndex;
  card: Card;
  /** Nur für den betroffenen Spieler gesetzt. */
  options: CaptureOption[] | null;
}

export interface RoundView {
  number: number;
  dealerSeat: SeatIndex;
  cutterSeat: SeatIndex;
  phase: RoundPhase;
  phaseStartedAt: number;
  deadline: number | null;
  deckCount: number;
  table: Card[];
  handCounts: number[];
  capturedCounts: Record<SideId, number>;
  currentSeat: SeatIndex;
  cut: CutInfo | null;
  dealOrder: DealOrder | null;
  dealOrderAuto: boolean;
  dealsDone: number;
  initialMovedJacks: Card[];
  initialReveal: Card[];
  /**
   * Tatsächliche unterste Karte des verbleibenden Decks – öffentlich bekannt (Schnittkarte bzw. danach
   * unter das Deck gelegte Buben). null vor dem Schneiden oder wenn das Deck leer ist.
   */
  deckBottom: Card | null;
  pending: PendingCaptureView | null;
  lastMove: MoveRecord | null;
  result: RoundResult | null;
}

export interface MatchView {
  playerCount: PlayerCount;
  sides: Side[];
  scores: Record<SideId, number>;
  targetScore: number;
  timings: MatchTimings;
  status: MatchStatus;
  winner: SideId | null;
  history: RoundResult[];
  round: RoundView;
  /** Eigener Sitz; null für Zuschauer. */
  mySeat: SeatIndex | null;
  myHand: Card[];
  version: number;
}

export function projectMatchView(state: MatchState, viewerSeat: SeatIndex | null): MatchView {
  const r = state.round;
  const pending: PendingCaptureView | null = r.pending
    ? { seat: r.pending.seat, card: r.pending.card, options: r.pending.seat === viewerSeat ? r.pending.options : null }
    : null;

  return structuredClone({
    playerCount: state.playerCount,
    sides: state.sides,
    scores: state.scores,
    targetScore: state.targetScore,
    timings: state.timings,
    status: state.status,
    winner: state.winner,
    history: state.history,
    round: {
      number: r.number,
      dealerSeat: r.dealerSeat,
      cutterSeat: cutterSeat(state),
      phase: r.phase,
      phaseStartedAt: r.phaseStartedAt,
      deadline: r.deadline,
      deckCount: r.deck.length,
      table: r.table,
      handCounts: r.hands.map((h) => h.length),
      capturedCounts: Object.fromEntries(Object.entries(r.captured).map(([id, cards]) => [id, cards.length])),
      currentSeat: r.currentSeat,
      cut: r.cut,
      dealOrder: r.dealOrder,
      dealOrderAuto: r.dealOrderAuto,
      dealsDone: r.dealsDone,
      initialMovedJacks: r.initialMovedJacks,
      initialReveal: r.initialReveal,
      deckBottom: r.cut && r.deck.length > 0 ? (r.deck[r.deck.length - 1] ?? null) : null,
      pending,
      lastMove: r.lastMove,
      result: r.result,
    },
    mySeat: viewerSeat,
    myHand: viewerSeat === null ? [] : (r.hands[viewerSeat] ?? []),
    version: state.version,
  });
}
