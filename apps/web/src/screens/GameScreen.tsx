import { type Card, type CardId, type ScreenPosition, findCaptureOptions, screenPositionOf, sortTable, teamOfSeat } from '@orlan/game';
import type { RoomView } from '@orlan/protocol';
import { type CSSProperties, useEffect, useMemo, useState } from 'react';
import { CutPicker } from '../components/CutPicker';
import { CardBack, PlayingCard } from '../components/PlayingCard';
import { RoundSummary } from '../components/RoundSummary';
import { ScoreBar } from '../components/ScoreBar';
import { SeatBadge } from '../components/SeatBadge';
import { TimerBar } from '../components/TimerBar';
import { useConfirm } from '../components/useConfirm';
import { describeCards, playerAtSeat, shortCard } from '../lib/display';
import { api } from '../net/client';

/** Richtung (in % der Tischmitte), aus der Karten eines Sitzes kommen bzw. wohin sie gehen. */
const POSITION_VECTOR: Record<ScreenPosition, { x: number; y: number }> = {
  bottom: { x: 0, y: 160 },
  top: { x: 0, y: -160 },
  left: { x: -220, y: 0 },
  right: { x: 220, y: 0 },
  topLeft: { x: -160, y: -140 },
  topRight: { x: 160, y: -140 },
};

export function GameScreen({ view }: { view: RoomView }) {
  const match = view.match!;
  const round = match.round;
  const mySeat = match.mySeat;
  const n = match.playerCount;
  const viewerSeat = mySeat ?? 0;
  const [error, setError] = useState<string | null>(null);
  const [selectedCard, setSelectedCard] = useState<CardId | null>(null);
  const [selectedCapture, setSelectedCapture] = useState<CardId[]>([]);
  const { confirm, dialog } = useConfirm();
  const isHost = view.myPlayerId === view.hostId;

  const isMyTurn = round.phase === 'turn' && round.currentSeat === mySeat;
  const myPending = round.phase === 'choosingCapture' && round.pending?.seat === mySeat ? round.pending : null;
  const iCut = round.phase === 'cutting' && round.cutterSeat === mySeat;
  const iChooseDeal = round.phase === 'choosingDealOrder' && round.cutterSeat === mySeat;

  // Auswahl zurücksetzen, sobald der Zug vorbei ist.
  useEffect(() => {
    if (!isMyTurn) setSelectedCard(null);
  }, [isMyTurn]);
  useEffect(() => {
    if (!myPending) setSelectedCapture([]);
  }, [myPending]);

  const call = async (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    const res = await fn();
    setError(res.ok ? null : (res.error ?? 'Fehler'));
  };

  const myHand = useMemo(() => sortTable(match.myHand), [match.myHand]);
  const selected = myHand.find((c) => c.id === selectedCard) ?? null;
  const preview = selected ? findCaptureOptions(selected, round.table) : null;

  const captureOptionIds = new Set(myPending?.options?.flat() ?? []);
  const captureKey = (ids: readonly CardId[]) => [...ids].sort().join(',');
  const selectionIsLegal = !!myPending?.options?.some((o) => captureKey(o) === captureKey(selectedCapture));

  const nameOf = (seat: number) => playerAtSeat(view, seat)?.name ?? `Sitz ${seat + 1}`;
  const positionOf = (seat: number) => screenPositionOf(viewerSeat, seat, n);

  const timerTotal = round.phase === 'cutting' ? match.timings.cutMs : match.timings.turnMs;
  const showTimer = round.phase === 'cutting' || round.phase === 'turn' || round.phase === 'choosingCapture';
  const timerLabel =
    round.phase === 'cutting'
      ? `${nameOf(round.cutterSeat)} schneidet`
      : `${round.currentSeat === mySeat ? 'Du bist' : `${nameOf(round.currentSeat)} ist`} am Zug`;

  const lastMove = round.lastMove;
  const moveText = lastMove
    ? `${nameOf(lastMove.seat)} spielte ${shortCard(lastMove.card)}${
        lastMove.captured.length > 0 ? ` und nahm ${describeCards(lastMove.captured)}` : ''
      }${lastMove.byTimeout ? ' (Zeit abgelaufen)' : ''}`
    : null;

  const openMenu = () => {
    confirm({
      title: isHost ? 'Match abbrechen?' : 'Raum verlassen?',
      message: isHost
        ? 'Das laufende Match wird für alle sofort beendet. Alle kehren in die Lobby zurück.'
        : 'Wenn du den Raum verlässt, wird das Match für alle beendet.',
      confirmLabel: isHost ? 'Match abbrechen' : 'Verlassen',
      danger: true,
      action: () => void (isHost ? call(api.abortMatch) : api.leaveRoom()),
    });
  };

  const kickFromGame = (playerId: string, name: string) =>
    confirm({
      title: 'Spieler entfernen?',
      message: `${name} wird entfernt. Das laufende Match wird dadurch beendet.`,
      confirmLabel: 'Entfernen',
      danger: true,
      action: () => void call(() => api.kick(playerId)),
    });

  const seatOrder = Array.from({ length: n }, (_, seat) => seat);
  const inPlayZone = round.phase === 'moveAnimation' ? lastMove : null;

  return (
    <main className={`game game--${n}p`}>
      <header className="game__header">
        <ScoreBar view={view} />
        <div className="game__menu">
          {isHost && (
            <details className="host-menu">
              <summary className="btn btn--ghost btn--sm">Host</summary>
              <div className="host-menu__panel panel">
                <button type="button" className="btn btn--danger btn--sm btn--block" onClick={openMenu} disabled={match.status !== 'running'}>
                  Match abbrechen
                </button>
                {view.players
                  .filter((p) => p.id !== view.myPlayerId)
                  .map((p) => (
                    <button key={p.id} type="button" className="btn btn--ghost btn--sm btn--block" onClick={() => kickFromGame(p.id, p.name)}>
                      {p.name} entfernen
                    </button>
                  ))}
              </div>
            </details>
          )}
          {!isHost && (
            <button type="button" className="btn btn--ghost btn--sm" onClick={openMenu}>
              Verlassen
            </button>
          )}
        </div>
      </header>

      <div className="table-area">
        {seatOrder
          .filter((seat) => seat !== mySeat)
          .map((seat) => (
            <SeatBadge
              key={seat}
              player={playerAtSeat(view, seat)}
              position={positionOf(seat)}
              handCount={round.handCounts[seat] ?? 0}
              isDealer={round.dealerSeat === seat}
              isActive={isSeatActive(round.phase, round.currentSeat, round.cutterSeat, round.pending?.seat ?? null, seat)}
              isMe={false}
              team={n === 4 ? teamOfSeat(seat) : null}
            />
          ))}

        <section className="center">
          <div className="center__timer">{showTimer && <TimerBar deadline={round.deadline} totalMs={timerTotal} label={timerLabel} />}</div>

          <div className="center__status" aria-live="polite">
            {round.phase === 'shuffling' && <span>Karten werden gemischt …</span>}
            {round.phase === 'cutting' && !iCut && <span>{nameOf(round.cutterSeat)} schneidet das Deck …</span>}
            {round.phase === 'choosingDealOrder' && !iChooseDeal && <span>{nameOf(round.cutterSeat)} wählt: Tisch oder Spieler zuerst …</span>}
            {round.phase === 'dealing' && <span>Karten werden ausgeteilt …</span>}
            {round.phase === 'choosingCapture' && round.pending && !myPending && (
              <span>{nameOf(round.pending.seat)} wählt eine Aufnahme …</span>
            )}
            {(round.phase === 'moveAnimation' || round.phase === 'turn') && moveText && <span>{moveText}</span>}
          </div>

          <div className="center__deck">
            {round.phase === 'shuffling' ? (
              <div className="shuffle-anim" aria-hidden="true">
                <CardBack size="md" className="shuffle-anim__a" />
                <CardBack size="md" className="shuffle-anim__b" />
              </div>
            ) : (
              round.deckCount > 0 && (
                <div className="deck-stack" title={`${round.deckCount} Karten im Deck`}>
                  <CardBack size="sm" />
                  <span className="deck-stack__count">{round.deckCount}</span>
                </div>
              )
            )}
            {round.cut && round.deckCount > 0 && (
              <div className="cut-card">
                <PlayingCard card={round.cut.revealedCard} size="sm" className={round.phase === 'choosingDealOrder' ? 'card--reveal' : ''} />
                <small className="muted">
                  Letzte Karte für {nameOf(round.dealerSeat)}
                  {round.cut.auto ? ' (auto)' : ''}
                </small>
              </div>
            )}
          </div>

          {iCut && <CutPicker deckCount={round.deckCount} onConfirm={(index) => void call(() => api.gameAction({ type: 'cut', index }))} />}

          {iChooseDeal && (
            <div className="deal-choice">
              <p>Wie soll ausgeteilt werden?</p>
              <div className="row">
                <button type="button" className="btn btn--primary" onClick={() => void call(() => api.gameAction({ type: 'chooseDealOrder', order: 'playersFirst' }))}>
                  Spieler zuerst
                </button>
                <button type="button" className="btn btn--secondary" onClick={() => void call(() => api.gameAction({ type: 'chooseDealOrder', order: 'tableFirst' }))}>
                  Tisch zuerst
                </button>
              </div>
            </div>
          )}

          {round.phase === 'dealing' && round.initialMovedJacks.length > 0 && round.table.length > 0 && (
            <p className="muted small">
              {round.initialMovedJacks.map(shortCard).join(', ')} beim Aufdecken unter das Deck gelegt.
            </p>
          )}

          {(inPlayZone || round.pending) && (
            <PlayZone
              key={inPlayZone ? `${inPlayZone.seat}-${inPlayZone.card.id}` : `pending-${round.pending!.card.id}`}
              card={inPlayZone ? inPlayZone.card : round.pending!.card}
              captured={inPlayZone ? inPlayZone.captured : []}
              from={POSITION_VECTOR[positionOf(inPlayZone ? inPlayZone.seat : round.pending!.seat)]}
            />
          )}

          <div className="table-cards" aria-label="Tischkarten">
            {round.table.map((card) => (
              <PlayingCard
                key={card.id}
                card={card}
                highlighted={myPending ? captureOptionIds.has(card.id) : preview?.some((o) => o.includes(card.id))}
                selected={selectedCapture.includes(card.id)}
                dimmed={!!myPending && !captureOptionIds.has(card.id)}
                onClick={
                  myPending && captureOptionIds.has(card.id)
                    ? () => setSelectedCapture((sel) => (sel.includes(card.id) ? sel.filter((id) => id !== card.id) : [...sel, card.id]))
                    : undefined
                }
              />
            ))}
            {round.table.length === 0 && round.phase !== 'shuffling' && round.phase !== 'cutting' && <span className="muted">Tisch ist leer</span>}
          </div>
        </section>

        {mySeat !== null && (
          <section className={`me ${isSeatActive(round.phase, round.currentSeat, round.cutterSeat, round.pending?.seat ?? null, mySeat) ? 'is-active' : ''}`}>
            <SeatBadge
              player={playerAtSeat(view, mySeat)}
              position="bottom"
              handCount={myHand.length}
              isDealer={round.dealerSeat === mySeat}
              isActive={false}
              isMe
              team={n === 4 ? teamOfSeat(mySeat) : null}
            />

            {myPending?.options && (
              <div className="capture-choice">
                <p>Wähle deine Aufnahme:</p>
                <div className="row row--wrap">
                  {myPending.options.map((opt) => (
                    <button
                      key={opt.join()}
                      type="button"
                      className={`chip ${captureKey(opt) === captureKey(selectedCapture) ? 'is-active' : ''}`}
                      onClick={() => setSelectedCapture(opt)}
                    >
                      {describeCards(opt.map((id) => round.table.find((c) => c.id === id)).filter((c): c is Card => !!c))}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="btn btn--primary btn--block"
                  disabled={!selectionIsLegal}
                  onClick={() => void call(() => api.gameAction({ type: 'chooseCapture', cardIds: selectedCapture }))}
                >
                  Nehmen
                </button>
              </div>
            )}

            <div className="hand" aria-label="Deine Handkarten">
              {myHand.map((card) => (
                <PlayingCard
                  key={card.id}
                  card={card}
                  size="lg"
                  selected={card.id === selectedCard}
                  onClick={isMyTurn ? () => setSelectedCard((id) => (id === card.id ? null : card.id)) : undefined}
                />
              ))}
            </div>

            {isMyTurn && (
              <div className="play-bar">
                <span className="muted small">
                  {!selected
                    ? 'Karte auswählen'
                    : preview && preview.length > 1
                      ? 'Mehrere Aufnahmen möglich – nach dem Spielen wählen'
                      : preview && preview.length === 1
                        ? `Nimmt automatisch ${describeCards(preview[0]!.map((id) => round.table.find((c) => c.id === id)!).filter(Boolean))}`
                        : 'Keine Aufnahme – Karte bleibt am Tisch'}
                </span>
                <button
                  type="button"
                  className="btn btn--primary btn--lg"
                  disabled={!selected}
                  onClick={() => selected && void call(() => api.gameAction({ type: 'playCard', cardId: selected.id }))}
                >
                  Spielen
                </button>
              </div>
            )}
          </section>
        )}
      </div>

      {error && (
        <p className="error error--floating" role="alert" onClick={() => setError(null)}>
          {error}
        </p>
      )}

      {round.phase === 'roundSummary' && <RoundSummary view={view} onReturnToLobby={() => void call(api.returnToLobby)} />}
      {dialog}
    </main>
  );
}

function isSeatActive(phase: string, currentSeat: number, cutterSeat: number, pendingSeat: number | null, seat: number): boolean {
  if (phase === 'turn') return currentSeat === seat;
  if (phase === 'choosingCapture') return pendingSeat === seat;
  if (phase === 'cutting' || phase === 'choosingDealOrder') return cutterSeat === seat;
  return false;
}

/** Sichtbare Zuganimation: gespielte Karte kommt zur Mitte, aufgenommene Karten werden hervorgehoben und eingesammelt. */
function PlayZone({ card, captured, from }: { card: Card; captured: Card[]; from: { x: number; y: number } }) {
  const style = { '--from-x': `${from.x}%`, '--from-y': `${from.y}%` } as CSSProperties;
  const collecting = captured.length > 0;
  return (
    <div className={`play-zone ${collecting ? 'play-zone--collect' : ''}`} style={style} aria-hidden="true">
      <PlayingCard card={card} className="play-zone__played" />
      {captured.map((c) => (
        <PlayingCard key={c.id} card={c} className="play-zone__captured" highlighted />
      ))}
    </div>
  );
}
