import { type Card, type CardId, findCaptureOptions, sortTable } from '@orlan/game';
import type { RoomView } from '@orlan/protocol';
import { useEffect, useMemo, useState } from 'react';
import { CutAnimation, ShuffleAnimation } from '../anim/DeckAnimations';
import { FlyLayer } from '../anim/FlyLayer';
import { syncedDelay, useMountElapsed, usePhaseElapsed } from '../anim/phaseClock';
import { anchors, moveTimeline, phaseVisibility, planFlights, visibilityMilestones } from '../anim/timeline';
import { SoundToggle } from '../components/SoundToggle';
import { TimerWarning } from '../sound/TimerWarning';
import { CutPicker } from '../components/CutPicker';
import { CardBack, PlayingCard } from '../components/PlayingCard';
import { RoundSummary } from '../components/RoundSummary';
import { ScoreBar } from '../components/ScoreBar';
import { SeatBadge } from '../components/SeatBadge';
import { CardLabel, CardList } from '../components/CardLabel';
import { PhaseTimer } from '../components/TimerBar';
import { captureSelectionState, toggleCaptureCard } from '../lib/captureSelection';
import { timerDisplay } from '../lib/timerDisplay';
import { useConfirm } from '../components/useConfirm';
import { lastCardLabel, playerAtSeat, seatDisplays, showEmptyTableHint } from '../lib/display';
import { api, serverNow } from '../net/client';

export function GameScreen({ view }: { view: RoomView }) {
  const match = view.match!;
  const round = match.round;
  const mySeat = match.mySeat;
  const n = match.playerCount;
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

  const captureKey = (ids: readonly CardId[]) => [...ids].sort().join(',');
  const capture = myPending?.options ? captureSelectionState(myPending.card, myPending.options, round.table, selectedCapture) : null;
  const cardsOf = (ids: readonly CardId[]) => ids.map((id) => round.table.find((c) => c.id === id)).filter((c): c is Card => !!c);

  const nameOf = (seat: number) => playerAtSeat(view, seat)?.name ?? `Sitz ${seat + 1}`;

  // Timer: wer gerade handeln muss, sieht seinen eigenen Countdown groß und deutlich.
  const timerInfo = timerDisplay(view, serverNow());
  const myTurnTimer = !!timerInfo?.isMine && timerInfo.kind === 'turn';

  const lastMove = round.lastMove;
  const moveText = lastMove ? (
    <>
      {nameOf(lastMove.seat)} spielte <CardLabel card={lastMove.card} />
      {lastMove.captured.length > 0 && (
        <>
          {' '}
          und nahm <CardList cards={lastMove.captured} />
        </>
      )}
      {lastMove.byTimeout ? ' (Zeit abgelaufen)' : ''}
    </>
  ) : null;

  const openMenu = () => {
    confirm({
      title: isHost ? 'Match abbrechen?' : 'Raum verlassen?',
      message: isHost
        ? 'Das laufende Match wird für alle sofort beendet. Alle kehren in die Lobby zurück.'
        : 'Wenn du den Raum verlässt, wird das aktuelle Match abgebrochen. Möchtest du wirklich verlassen?',
      confirmLabel: isHost ? 'Match abbrechen' : 'Raum verlassen',
      danger: true,
      action: () => void (isHost ? call(api.abortMatch) : api.leaveRoom()),
    });
  };

  const hostLeave = () =>
    confirm({
      title: 'Raum verlassen?',
      message: 'Du bist Host. Wenn du den Raum verlässt, wird das laufende Spiel beendet und der Raum für alle geschlossen.',
      confirmLabel: 'Raum schließen',
      danger: true,
      action: () => void api.leaveRoom(),
    });

  const kickFromGame = (playerId: string, name: string) =>
    confirm({
      title: 'Spieler entfernen?',
      message: `${name} wird entfernt. Das laufende Match wird abgebrochen, die Punkte verfallen und alle kehren in die Lobby zurück.`,
      confirmLabel: 'Entfernen',
      danger: true,
      action: () => void call(() => api.kick(playerId)),
    });

  const seats = seatDisplays(view);
  const mySeatDisplay = seats.find((s) => s.isMe);

  // Animationen: reine Darstellung des bestätigten Serverzustands, synchronisiert über die Serverzeit.
  const flights = useMemo(() => planFlights(view), [view]);
  const vis = useMemo(() => phaseVisibility(view), [view]);
  const elapsed = usePhaseElapsed(round.phaseStartedAt, visibilityMilestones(vis));
  const mountElapsed = useMountElapsed(round.phaseStartedAt);
  const shown = (at: number | undefined) => at === undefined || elapsed >= at;
  const hiddenAfter = (at: number | undefined) => at !== undefined && elapsed >= at;
  const liftDelay = syncedDelay(moveTimeline(match.timings.moveAnimationMs).flyInEnd, mountElapsed);

  return (
    <main className={`game game--${n}p`}>
      <header className="game__header">
        <ScoreBar view={view} />
        <div className="game__menu">
          <SoundToggle />
          {isHost && (
            <details className="host-menu">
              <summary className="btn btn--ghost btn--sm" aria-label="Host-Menü">
                ☰ Menü
              </summary>
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
                <button type="button" className="btn btn--ghost btn--sm btn--block" onClick={hostLeave}>
                  Raum verlassen
                </button>
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
        {seats
          .filter((s) => !s.isMe)
          .map((s) => (
            <SeatBadge
              key={s.seat}
              display={s}
              handCount={shown(vis.handAppearAt[s.seat]) ? (round.handCounts[s.seat] ?? 0) : 0}
              chipVisible={shown(vis.chipAppearAt)}
              isActive={isSeatActive(round.phase, round.currentSeat, round.cutterSeat, round.pending?.seat ?? null, s.seat)}
            />
          ))}

        <section className="center">
          <div className="center__timer">{timerInfo && !myTurnTimer && <PhaseTimer view={view} prominent={timerInfo.isMine} />}</div>

          <div className={`center__status ${myPending ? 'is-collapsed' : ''}`} aria-live="polite">
            {round.phase === 'shuffling' && <span>Karten werden gemischt …</span>}
            {round.phase === 'cutting' && !iCut && <span>{nameOf(round.cutterSeat)} schneidet das Deck …</span>}
            {round.phase === 'cutReveal' && round.cut && (
              <span>
                {nameOf(round.cutterSeat)} hat bei {round.cut.index} Karten abgehoben{round.cut.auto ? ' (automatisch)' : ''} …
              </span>
            )}
            {round.phase === 'choosingDealOrder' && !iChooseDeal && <span>{nameOf(round.cutterSeat)} wählt: Tisch oder Spieler zuerst …</span>}
            {round.phase === 'dealing' && (
              <span>
                Karten werden ausgeteilt
                {round.dealOrder && round.dealsDone === 1
                  ? ` – ${round.dealOrder === 'playersFirst' ? 'Spieler zuerst' : 'Tisch zuerst'}${round.dealOrderAuto ? ' (Zeit abgelaufen, zufällig gewählt)' : ''}`
                  : ''}{' '}
                …
              </span>
            )}
            {round.phase === 'choosingCapture' && round.pending && !myPending && (
              <span>{nameOf(round.pending.seat)} wählt eine Aufnahme …</span>
            )}
            {(round.phase === 'moveAnimation' || round.phase === 'turn') && moveText && <span>{moveText}</span>}
          </div>

          <div className={`center__deck ${myPending ? 'is-collapsed' : ''}`}>
            {round.phase === 'shuffling' ? (
              <ShuffleAnimation key={round.phaseStartedAt} phaseStartedAt={round.phaseStartedAt} durationMs={match.timings.shuffleMs} />
            ) : round.phase === 'cutReveal' && round.cut ? (
              <CutAnimation
                key={round.phaseStartedAt}
                phaseStartedAt={round.phaseStartedAt}
                durationMs={match.timings.cutRevealMs}
                cutIndex={round.cut.index}
                deckCount={round.deckCount}
                revealedCard={round.cut.revealedCard}
              />
            ) : (
              <div className={`deck-stack ${round.deckCount === 0 ? 'is-hidden' : ''}`} data-anchor={anchors.deck} title={`${round.deckCount} Karten im Deck`}>
                <CardBack size="sm" />
                <span className="deck-stack__count">{round.deckCount}</span>
              </div>
            )}
            {round.cut && round.deckCount > 0 && round.phase !== 'cutReveal' && (
              <div className="cut-card">
                <PlayingCard card={round.cut.revealedCard} size="sm" className={round.phase === 'choosingDealOrder' ? 'card--settle' : ''} />
                <span className="cut-card__text">
                  <small>{lastCardLabel(view)}</small>
                  {round.cut.auto && <small className="cut-card__auto">automatisch geschnitten</small>}
                </span>
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
              <CardList cards={round.initialMovedJacks} separator="," /> beim Aufdecken unter das Deck gelegt.
            </p>
          )}

          {/* Eigene Auswahl: Panel direkt über den Tischkarten, die gespielte Karte steht im Titel (Flugziel). */}
            {myPending?.options && capture && (
              <div className="capture-choice" role="group" aria-label="Aufnahme wählen">
                <p className="capture-choice__title">
                  <span data-anchor={anchors.slot}>
                    <CardLabel card={myPending.card} />
                  </span>{' '}
                  gespielt – wähle deine Aufnahme:
                </p>
                <div className="capture-options">
                  {myPending.options.map((opt) => {
                    const active = captureKey(opt) === captureKey(selectedCapture);
                    return (
                      <button
                        key={opt.join()}
                        type="button"
                        className={`capture-option ${active ? 'is-active' : ''}`}
                        aria-pressed={active}
                        onClick={() => setSelectedCapture(active ? [] : opt)}
                      >
                        <CardList cards={cardsOf(opt)} />
                        {capture.isSum && <span className="capture-option__sum">= {capture.target}</span>}
                        {active && <span className="capture-option__check" aria-hidden="true">✓</span>}
                      </button>
                    );
                  })}
                </div>
                <p className={`capture-choice__status ${capture.match ? 'is-valid' : ''}`} aria-live="polite">
                  {capture.match ? (
                    <>
                      ✓ Gültig: <CardLabel card={myPending.card} /> + <CardList cards={cardsOf(capture.match)} />
                      {capture.isSum && <> = {capture.target}</>}
                    </>
                  ) : selectedCapture.length > 0 && capture.isSum ? (
                    <>
                      Summe {capture.sum} – noch {capture.target - capture.sum} bis {capture.target}
                    </>
                  ) : (
                    'Kombination antippen oder markierte Tischkarten wählen'
                  )}
                </p>
                <button
                  type="button"
                  className="btn btn--primary btn--block btn--lg"
                  disabled={!capture.match}
                  onClick={() => capture.match && void call(() => api.gameAction({ type: 'chooseCapture', cardIds: capture.match! }))}
                >
                  Nehmen
                </button>
              </div>
            )}


          <div className={`play-slot ${myPending ? 'is-collapsed' : ''}`} data-anchor={myPending ? undefined : anchors.slot}>
            {round.phase === 'choosingCapture' && round.pending && !myPending && (
              <PlayingCard card={round.pending.card} className={shown(vis.slotAppearAt) ? '' : 'is-hidden'} />
            )}
          </div>

          <div className="table-cards" aria-label="Tischkarten" data-anchor={anchors.table}>
            {vis.table.map((card) => (
              <PlayingCard
                key={card.id}
                card={card}
                anchor={anchors.tableCard(card.id)}
                className={[
                  !shown(vis.tableAppearAt[card.id]) || hiddenAfter(vis.tableHideAt[card.id]) ? 'is-hidden' : '',
                  vis.lifted.includes(card.id) ? 'card--lifting' : '',
                ].join(' ')}
                style={vis.lifted.includes(card.id) ? liftDelay : undefined}
                highlighted={capture ? capture.legalIds.has(card.id) : preview?.some((o) => o.includes(card.id))}
                selected={selectedCapture.includes(card.id)}
                dimmed={!!capture && !capture.legalIds.has(card.id)}
                onClick={
                  capture && capture.legalIds.has(card.id)
                    ? () => setSelectedCapture((sel) => toggleCaptureCard(myPending!.options!, sel, card.id))
                    : undefined
                }
              />
            ))}
            {vis.table.length === 0 && showEmptyTableHint(view) && <span className="muted">Tisch ist leer</span>}
          </div>
        </section>

        {mySeat !== null && (
          <section data-anchor={anchors.seat(mySeat)} className={`me ${isSeatActive(round.phase, round.currentSeat, round.cutterSeat, round.pending?.seat ?? null, mySeat) ? 'is-active' : ''}`}>
            {mySeatDisplay && <SeatBadge display={mySeatDisplay} handCount={myHand.length} chipVisible={shown(vis.chipAppearAt)} isActive={false} />}

            {myTurnTimer && <PhaseTimer view={view} prominent />}

            <div className={`hand ${shown(vis.handAppearAt[mySeat]) ? '' : 'is-hidden'} ${myPending ? 'hand--waiting' : ''}`} aria-label="Deine Handkarten">
              {myHand.map((card) => (
                <PlayingCard
                  key={card.id}
                  card={card}
                  size={myPending ? 'md' : 'lg'}
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
                        ? <>Nimmt automatisch <CardList cards={cardsOf(preview[0]!)} /></>
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

      <FlyLayer flights={flights} phaseStartedAt={round.phaseStartedAt} />
      <TimerWarning view={view} />

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
