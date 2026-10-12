/**
 * Match-Engine als reiner, deterministischer Zustandsautomat.
 *
 * - Kein I/O, keine echten Timer: Zeit kommt als `now` herein, Zufall als `rng`.
 * - Spieleraktionen: `applyAction`. Zeitabläufe (Schneide-Timer, Zug-Timer, Animationen): `advanceTime`.
 * - Der Server hält den einzigen echten Zustand und ruft beide Funktionen auf.
 */
import { type Card, type CardId, sortTable } from './cards';
import { type CaptureOption, chooseBestCapture, findCaptureOptions, isLegalCapture } from './capture';
import { type Deck, createDeck, cutDeck, drawPacket, isValidCutIndex, randomCutIndex, revealInitialTable, shuffleDeck } from './deck';
import { type Rng, pickRandom } from './rng';
import {
  type PlayerCount,
  type SeatIndex,
  type Side,
  type SideId,
  buildSides,
  dealingOrder,
  firstPlayerSeat,
  nextDealerSeat,
  seatToRight,
  sideIdOfSeat,
} from './seating';
import { MATCH_TARGET_SCORE, type RoundScore, determineMatchWinner, scoreRound } from './scoring';

export const PACKET_SIZE = 4;
export const TABLE_SIZE = 4;

export interface MatchTimings {
  /** Sichtbare Mischanimation. */
  shuffleMs: number;
  /** Zeit zum Auswählen und Bestätigen des Schnitts (Regel: 15 Sekunden). */
  cutMs: number;
  /** Sichtbare Schnitt-Animation (Stapel teilen, Karte zeigen, unterlegen) – reine Darstellung. */
  cutRevealMs: number;
  /** Zeit für die Wahl "Spieler zuerst / Tisch zuerst" (Regel: 7 Sekunden, startet nach der Schnitt-Animation). */
  dealOrderMs: number;
  /** Sichtbare Austeilanimation der Spielerpakete. */
  dealMs: number;
  /** Erstes Tisch-Aufdecken: Dauer pro aufgedeckter Tischkarte. */
  tableRevealCardMs: number;
  /** Erstes Tisch-Aufdecken: Dauer pro Bube (zeigen, Hinweis, unter das Deck legen). */
  jackRevealMs: number;
  /** Zugzeit inkl. ggf. Kombinationsauswahl (Regel: 30 Sekunden). */
  turnMs: number;
  /** Zuganimation, bevor der nächste Timer startet (Regel: ca. 1–1,5 s). */
  moveAnimationMs: number;
  /** Anzeigedauer der Rundenauswertung. */
  roundSummaryMs: number;
}

/**
 * Dauer der Austeilphase: Spielerpakete, beim ersten Austeilen zusätzlich das Aufdecken der vier Tischkarten
 * und für jeden aufgedeckten Buben eine eigene, gut nachvollziehbare Darstellung. Reine Darstellungszeit.
 */
export function dealDuration(t: MatchTimings, initial: boolean, jackCount: number): number {
  return t.dealMs + (initial ? TABLE_SIZE * t.tableRevealCardMs + jackCount * t.jackRevealMs : 0);
}

export const DEFAULT_TIMINGS: MatchTimings = {
  shuffleMs: 1800,
  cutMs: 15000,
  cutRevealMs: 1700,
  dealOrderMs: 7000,
  dealMs: 1800,
  tableRevealCardMs: 220,
  jackRevealMs: 2400,
  turnMs: 30000,
  moveAnimationMs: 1300,
  roundSummaryMs: 17000, // 12 s + 5 s
};

export type DealOrder = 'playersFirst' | 'tableFirst';

export type RoundPhase =
  | 'shuffling'
  | 'cutting'
  | 'cutReveal'
  | 'choosingDealOrder'
  | 'dealing'
  | 'turn'
  | 'choosingCapture'
  | 'moveAnimation'
  | 'roundSummary';

export const DEAL_ORDERS: readonly DealOrder[] = ['playersFirst', 'tableFirst'];

export interface CutInfo {
  index: number;
  revealedCard: Card;
  auto: boolean;
}

export interface MoveRecord {
  seat: SeatIndex;
  card: Card;
  captured: Card[];
  byTimeout: boolean;
  /** true = Karte lag bereits während der Kombinationsauswahl in der Mitte (nur für die Darstellung). */
  viaChoice: boolean;
}

export interface PendingCapture {
  seat: SeatIndex;
  card: Card;
  options: CaptureOption[];
}

export interface RoundResult {
  roundNumber: number;
  dealerSeat: SeatIndex;
  score: RoundScore;
  /** Restkarten am Tisch, die an die zuletzt aufnehmende Seite gingen. */
  leftoverCards: Card[];
  leftoverSide: SideId | null;
  scoresAfter: Record<SideId, number>;
}

export interface RoundState {
  number: number;
  dealerSeat: SeatIndex;
  phase: RoundPhase;
  phaseStartedAt: number;
  /** Server-Zeitpunkt (ms), an dem die aktuelle Phase automatisch weiterläuft; null = wartet auf Aktion. */
  deadline: number | null;
  deck: Deck;
  hands: Card[][];
  /** Immer sortiert (siehe sortTable). */
  table: Card[];
  captured: Record<SideId, Card[]>;
  lastCapturerSide: SideId | null;
  currentSeat: SeatIndex;
  cut: CutInfo | null;
  dealOrder: DealOrder | null;
  /** true, wenn die Austeilreihenfolge nach Ablauf der 7 s zufällig gewählt wurde. */
  dealOrderAuto: boolean;
  initialMovedJacks: Card[];
  /** Erstes Tisch-Aufdecken in Reihenfolge (inkl. Buben) – für die Darstellung. */
  initialReveal: Card[];
  dealsDone: number;
  pending: PendingCapture | null;
  lastMove: MoveRecord | null;
  result: RoundResult | null;
}

export type MatchStatus = 'running' | 'finished';

export interface MatchState {
  playerCount: PlayerCount;
  sides: Side[];
  scores: Record<SideId, number>;
  targetScore: number;
  timings: MatchTimings;
  status: MatchStatus;
  winner: SideId | null;
  round: RoundState;
  history: RoundResult[];
  /** Erhöht sich bei jeder Zustandsänderung – hilft Clients bei der Synchronisation. */
  version: number;
}

export type MatchAction =
  | { type: 'cut'; seat: SeatIndex; index: number }
  | { type: 'chooseDealOrder'; seat: SeatIndex; order: DealOrder }
  | { type: 'playCard'; seat: SeatIndex; cardId: CardId }
  | { type: 'chooseCapture'; seat: SeatIndex; cardIds: CardId[] };

export type MatchEvent =
  | { type: 'roundStarted'; roundNumber: number; dealerSeat: SeatIndex }
  | { type: 'deckCut'; seat: SeatIndex; cut: CutInfo }
  | { type: 'dealOrderChosen'; seat: SeatIndex; order: DealOrder; auto: boolean }
  | { type: 'cardsDealt'; initial: boolean; movedJacks: Card[] }
  | { type: 'captureChoiceRequired'; seat: SeatIndex }
  | { type: 'cardPlayed'; move: MoveRecord }
  | { type: 'turnStarted'; seat: SeatIndex }
  | { type: 'roundEnded'; result: RoundResult }
  | { type: 'matchFinished'; winner: SideId };

export interface EngineContext {
  now: number;
  rng: Rng;
}

export type ActionResult =
  | { ok: true; state: MatchState; events: MatchEvent[] }
  | { ok: false; error: string };

export interface CreateMatchOptions {
  playerCount: PlayerCount;
  /** Erste Runde: der Host ist Dealer. */
  firstDealerSeat: SeatIndex;
  timings?: Partial<MatchTimings>;
  targetScore?: number;
}

// ---------------------------------------------------------------------------
// Erzeugen
// ---------------------------------------------------------------------------

export function createMatch(options: CreateMatchOptions, ctx: EngineContext): { state: MatchState; events: MatchEvent[] } {
  const sides = buildSides(options.playerCount);
  const scores = Object.fromEntries(sides.map((s) => [s.id, 0]));
  const timings = { ...DEFAULT_TIMINGS, ...options.timings };
  const state: MatchState = {
    playerCount: options.playerCount,
    sides,
    scores,
    targetScore: options.targetScore ?? MATCH_TARGET_SCORE,
    timings,
    status: 'running',
    winner: null,
    round: newRound(1, options.firstDealerSeat, options.playerCount, sides, timings, ctx),
    history: [],
    version: 1,
  };
  return { state, events: [{ type: 'roundStarted', roundNumber: 1, dealerSeat: options.firstDealerSeat }] };
}

function newRound(
  number: number,
  dealerSeat: SeatIndex,
  playerCount: PlayerCount,
  sides: Side[],
  timings: MatchTimings,
  ctx: EngineContext,
): RoundState {
  return {
    number,
    dealerSeat,
    phase: 'shuffling',
    phaseStartedAt: ctx.now,
    deadline: ctx.now + timings.shuffleMs,
    // Alle 52 Karten werden eingesammelt und vollständig neu gemischt.
    deck: shuffleDeck(createDeck(), ctx.rng),
    hands: Array.from({ length: playerCount }, () => []),
    table: [],
    captured: Object.fromEntries(sides.map((s) => [s.id, []])),
    lastCapturerSide: null,
    currentSeat: firstPlayerSeat(dealerSeat, playerCount),
    cut: null,
    dealOrder: null,
    dealOrderAuto: false,
    initialMovedJacks: [],
    initialReveal: [],
    dealsDone: 0,
    pending: null,
    lastMove: null,
    result: null,
  };
}

// ---------------------------------------------------------------------------
// Abgeleitete Informationen
// ---------------------------------------------------------------------------

/** Wer schneidet und die Austeilreihenfolge wählt: der Spieler rechts vom Dealer. */
export function cutterSeat(state: MatchState): SeatIndex {
  return firstPlayerSeat(state.round.dealerSeat, state.playerCount);
}

/** Legale Aufnahmen, falls `seat` jetzt `cardId` spielen würde (für Vorschau im Client). */
export function captureOptionsFor(state: MatchState, seat: SeatIndex, cardId: CardId): CaptureOption[] | null {
  const card = state.round.hands[seat]?.find((c) => c.id === cardId);
  return card ? findCaptureOptions(card, state.round.table) : null;
}

// ---------------------------------------------------------------------------
// Spieleraktionen
// ---------------------------------------------------------------------------

export function applyAction(state: MatchState, action: MatchAction, ctx: EngineContext): ActionResult {
  if (state.status !== 'running') return fail('Das Match ist beendet.');
  const next = structuredClone(state);
  const events: MatchEvent[] = [];
  const round = next.round;

  switch (action.type) {
    case 'cut': {
      if (round.phase !== 'cutting') return fail('Jetzt wird nicht geschnitten.');
      if (action.seat !== cutterSeat(next)) return fail('Nur der Spieler rechts vom Dealer darf schneiden.');
      if (!isValidCutIndex(action.index, round.deck.length)) return fail('Ungültige Schnittstelle.');
      performCut(next, action.index, false, ctx, events);
      break;
    }
    case 'chooseDealOrder': {
      if (round.phase !== 'choosingDealOrder') return fail('Die Austeilreihenfolge wird jetzt nicht gewählt.');
      if (action.seat !== cutterSeat(next)) return fail('Nur der Spieler rechts vom Dealer darf wählen.');
      if (action.order !== 'playersFirst' && action.order !== 'tableFirst') return fail('Ungültige Auswahl.');
      chooseDealOrder(next, action.order, false, ctx, events);
      break;
    }
    case 'playCard': {
      if (round.phase !== 'turn') return fail('Gerade kann keine Karte gespielt werden.');
      if (action.seat !== round.currentSeat) return fail('Du bist nicht am Zug.');
      const card = round.hands[action.seat]?.find((c) => c.id === action.cardId);
      if (!card) return fail('Diese Karte ist nicht in deiner Hand.');
      const options = findCaptureOptions(card, round.table);
      if (options.length <= 1) {
        // Keine oder genau eine legale Aufnahme -> automatisch ausführen.
        resolvePlay(next, action.seat, card, options[0] ?? [], false, ctx, events);
      } else {
        // Karte ist verbindlich gespielt, der Spieler wählt nun die Kombination.
        removeFromHand(round, action.seat, card.id);
        round.pending = { seat: action.seat, card, options };
        // Der Zug-Timer läuft weiter (gleiche Deadline); bei Ablauf wählt das System die beste Aufnahme.
        // phaseStartedAt markiert nur den Zeitpunkt des Ausspielens für die Animation.
        setPhase(round, 'choosingCapture', ctx.now, round.deadline);
        events.push({ type: 'captureChoiceRequired', seat: action.seat });
      }
      break;
    }
    case 'chooseCapture': {
      const pending = round.pending;
      if (round.phase !== 'choosingCapture' || !pending) return fail('Es ist keine Aufnahme zu wählen.');
      if (action.seat !== pending.seat) return fail('Du bist nicht am Zug.');
      if (!isLegalCapture(pending.card, round.table, action.cardIds)) return fail('Diese Kombination ist nicht legal.');
      round.pending = null;
      resolvePlay(next, action.seat, pending.card, action.cardIds, false, ctx, events, true);
      break;
    }
    default:
      return fail('Unbekannte Aktion.');
  }

  next.version++;
  return { ok: true, state: next, events };
}

// ---------------------------------------------------------------------------
// Zeitabläufe
// ---------------------------------------------------------------------------

/** Verarbeitet alle abgelaufenen Deadlines bis `ctx.now`. */
export function advanceTime(state: MatchState, ctx: EngineContext): { state: MatchState; events: MatchEvent[]; changed: boolean } {
  let current = state;
  const events: MatchEvent[] = [];
  let changed = false;
  // Obergrenze nur als Sicherheitsnetz gegen Programmierfehler.
  for (let i = 0; i < 100; i++) {
    const deadline = current.round.deadline;
    if (current.status !== 'running' || deadline === null || deadline > ctx.now) break;
    current = structuredClone(current);
    onDeadline(current, ctx, events);
    current.version++;
    changed = true;
  }
  return { state: current, events, changed };
}

function onDeadline(state: MatchState, ctx: EngineContext, events: MatchEvent[]): void {
  const round = state.round;
  switch (round.phase) {
    case 'shuffling':
      setPhase(round, 'cutting', ctx.now, ctx.now + state.timings.cutMs);
      break;
    case 'cutting':
      // Keine Bestätigung innerhalb von 15 s -> zufällige gültige Schnittstelle.
      performCut(state, randomCutIndex(round.deck.length, ctx.rng), true, ctx, events);
      break;
    case 'dealing':
      startTurn(state, round.currentSeat, ctx, events);
      break;
    case 'turn': {
      // Timeout: Schritt 1 – Handkarte rein zufällig wählen (ohne jede Strategie).
      const hand = round.hands[round.currentSeat] ?? [];
      const card = pickRandom(hand, ctx.rng);
      // Schritt 2 – erst danach die beste Aufnahme bestimmen.
      const best = chooseBestCapture(findCaptureOptions(card, round.table), round.table) ?? [];
      resolvePlay(state, round.currentSeat, card, best, true, ctx, events);
      break;
    }
    case 'choosingCapture': {
      const pending = round.pending;
      if (!pending) throw new Error('choosingCapture ohne pending');
      round.pending = null;
      const best = chooseBestCapture(pending.options, round.table) ?? [];
      resolvePlay(state, pending.seat, pending.card, best, true, ctx, events, true);
      break;
    }
    case 'moveAnimation':
      continueAfterMove(state, ctx, events);
      break;
    case 'roundSummary':
      startNextRound(state, ctx, events);
      break;
    case 'cutReveal':
      // Schnitt-Animation beendet -> erst jetzt beginnen die 7 s für die Wahl.
      setPhase(round, 'choosingDealOrder', ctx.now, ctx.now + state.timings.dealOrderMs);
      break;
    case 'choosingDealOrder':
      // Keine Wahl innerhalb von 7 s -> reiner Zufall zwischen beiden Optionen (unabhängig von den Karten).
      chooseDealOrder(state, DEAL_ORDERS[ctx.rng.int(DEAL_ORDERS.length)] as DealOrder, true, ctx, events);
      break;
  }
}

// ---------------------------------------------------------------------------
// Interne Schritte
// ---------------------------------------------------------------------------

function fail(error: string): ActionResult {
  return { ok: false, error };
}

function setPhase(round: RoundState, phase: RoundPhase, now: number, deadline: number | null): void {
  round.phase = phase;
  round.phaseStartedAt = now;
  round.deadline = deadline;
}

function performCut(state: MatchState, index: number, auto: boolean, ctx: EngineContext, events: MatchEvent[]): void {
  const round = state.round;
  const result = cutDeck(round.deck, index);
  round.deck = result.deck;
  round.cut = { index, revealedCard: result.revealedCard, auto };
  events.push({ type: 'deckCut', seat: cutterSeat(state), cut: round.cut });
  setPhase(round, 'cutReveal', ctx.now, ctx.now + state.timings.cutRevealMs);
}

function chooseDealOrder(state: MatchState, order: DealOrder, auto: boolean, ctx: EngineContext, events: MatchEvent[]): void {
  state.round.dealOrder = order;
  state.round.dealOrderAuto = auto;
  events.push({ type: 'dealOrderChosen', seat: cutterSeat(state), order, auto });
  performDeal(state, true, ctx, events);
}

function performDeal(state: MatchState, initial: boolean, ctx: EngineContext, events: MatchEvent[]): void {
  const round = state.round;
  let movedJacks: Card[] = [];
  const revealTable = () => {
    const result = revealInitialTable(round.deck, TABLE_SIZE);
    round.deck = result.deck;
    round.table = sortTable(result.table);
    movedJacks = result.movedJacks;
    round.initialMovedJacks = result.movedJacks;
    round.initialReveal = result.revealed;
  };

  if (initial && round.dealOrder === 'tableFirst') revealTable();
  // Komplette 4er-Pakete, beginnend rechts vom Dealer, der Dealer erhält zuletzt.
  for (const seat of dealingOrder(round.dealerSeat, state.playerCount)) {
    const packet = drawPacket(round.deck, PACKET_SIZE);
    round.deck = packet.deck;
    round.hands[seat] = packet.cards;
  }
  if (initial && round.dealOrder === 'playersFirst') revealTable();

  round.dealsDone++;
  round.currentSeat = firstPlayerSeat(round.dealerSeat, state.playerCount);
  events.push({ type: 'cardsDealt', initial, movedJacks });
  setPhase(round, 'dealing', ctx.now, ctx.now + dealDuration(state.timings, initial, movedJacks.length));
}

function startTurn(state: MatchState, seat: SeatIndex, ctx: EngineContext, events: MatchEvent[]): void {
  state.round.currentSeat = seat;
  setPhase(state.round, 'turn', ctx.now, ctx.now + state.timings.turnMs);
  events.push({ type: 'turnStarted', seat });
}

function removeFromHand(round: RoundState, seat: SeatIndex, cardId: CardId): void {
  const hand = round.hands[seat] ?? [];
  round.hands[seat] = hand.filter((c) => c.id !== cardId);
}

function resolvePlay(
  state: MatchState,
  seat: SeatIndex,
  card: Card,
  capturedIds: readonly CardId[],
  byTimeout: boolean,
  ctx: EngineContext,
  events: MatchEvent[],
  alreadyRemovedFromHand = false,
): void {
  const round = state.round;
  if (!alreadyRemovedFromHand) removeFromHand(round, seat, card.id);

  const ids = new Set(capturedIds);
  const captured = round.table.filter((c) => ids.has(c.id));
  if (captured.length > 0) {
    const side = sideIdOfSeat(seat, state.playerCount);
    round.table = round.table.filter((c) => !ids.has(c.id));
    (round.captured[side] ??= []).push(card, ...captured);
    round.lastCapturerSide = side;
  } else {
    round.table = sortTable([...round.table, card]);
  }

  round.lastMove = { seat, card, captured, byTimeout, viaChoice: alreadyRemovedFromHand };
  events.push({ type: 'cardPlayed', move: round.lastMove });
  setPhase(round, 'moveAnimation', ctx.now, ctx.now + state.timings.moveAnimationMs);
}

function continueAfterMove(state: MatchState, ctx: EngineContext, events: MatchEvent[]): void {
  const round = state.round;
  const handsEmpty = round.hands.every((h) => h.length === 0);
  if (!handsEmpty) {
    startTurn(state, seatToRight(round.currentSeat, state.playerCount), ctx, events);
    return;
  }
  if (round.deck.length > 0) {
    performDeal(state, false, ctx, events);
    return;
  }
  finishRound(state, ctx, events);
}

function finishRound(state: MatchState, ctx: EngineContext, events: MatchEvent[]): void {
  const round = state.round;
  // Restkarten gehen an die Seite, die zuletzt aufgenommen hat.
  const leftoverCards = [...round.table];
  const leftoverSide = leftoverCards.length > 0 ? round.lastCapturerSide : null;
  if (leftoverSide) {
    (round.captured[leftoverSide] ??= []).push(...leftoverCards);
    round.table = [];
  }

  const sideIds = state.sides.map((s) => s.id);
  const score = scoreRound(sideIds, round.captured);
  for (const s of score.stats) state.scores[s.sideId] = (state.scores[s.sideId] ?? 0) + s.points;

  const result: RoundResult = {
    roundNumber: round.number,
    dealerSeat: round.dealerSeat,
    score,
    leftoverCards,
    leftoverSide,
    scoresAfter: { ...state.scores },
  };
  round.result = result;
  state.history.push(result);
  events.push({ type: 'roundEnded', result });

  // Matchende nur nach vollständig abgeschlossener Runde.
  const winner = determineMatchWinner(state.scores, state.targetScore);
  if (winner) {
    state.status = 'finished';
    state.winner = winner;
    setPhase(round, 'roundSummary', ctx.now, null);
    events.push({ type: 'matchFinished', winner });
  } else {
    setPhase(round, 'roundSummary', ctx.now, ctx.now + state.timings.roundSummaryMs);
  }
}

function startNextRound(state: MatchState, ctx: EngineContext, events: MatchEvent[]): void {
  // Dealerwechsel erst nach Deckende und Punktevergabe.
  const dealer = nextDealerSeat(state.round.dealerSeat, state.playerCount);
  const number = state.round.number + 1;
  state.round = newRound(number, dealer, state.playerCount, state.sides, state.timings, ctx);
  events.push({ type: 'roundStarted', roundNumber: number, dealerSeat: dealer });
}

// ---------------------------------------------------------------------------
// Automatische Aktionen (für Dev-Testspieler / Bots)
// ---------------------------------------------------------------------------

/**
 * Liefert eine gültige Aktion für `seat`, falls dieser Sitz gerade handeln muss.
 * Verwendet dieselbe Zufallslogik wie die Timeout-Automatik.
 */
export function autoActionFor(state: MatchState, seat: SeatIndex, rng: Rng): MatchAction | null {
  if (state.status !== 'running') return null;
  const round = state.round;
  switch (round.phase) {
    case 'cutting':
      return seat === cutterSeat(state) ? { type: 'cut', seat, index: randomCutIndex(round.deck.length, rng) } : null;
    case 'choosingDealOrder':
      return seat === cutterSeat(state)
        ? { type: 'chooseDealOrder', seat, order: DEAL_ORDERS[rng.int(DEAL_ORDERS.length)] as DealOrder }
        : null;
    case 'turn': {
      if (seat !== round.currentSeat) return null;
      const hand = round.hands[seat] ?? [];
      return hand.length > 0 ? { type: 'playCard', seat, cardId: pickRandom(hand, rng).id } : null;
    }
    case 'choosingCapture': {
      if (!round.pending || round.pending.seat !== seat) return null;
      const best = chooseBestCapture(round.pending.options, round.table);
      return best ? { type: 'chooseCapture', seat, cardIds: best } : null;
    }
    default:
      return null;
  }
}
