import type { RoomView } from '@orlan/protocol';
import { sideLabel } from '../lib/display';
import { CardList } from './CardLabel';
import { useServerNow } from '../net/hooks';

interface Props {
  view: RoomView;
  onReturnToLobby: () => void;
}

/** Rundenauswertung – und bei Matchende die Siegeranzeige. */
export function RoundSummary({ view, onReturnToLobby }: Props) {
  const match = view.match;
  const result = match?.round.result;
  const deadline = match?.round.deadline ?? null;
  const now = useServerNow(deadline !== null);
  if (!match || !result) return null;
  const { score } = result;
  const isHost = view.myPlayerId === view.hostId;
  const finished = match.status === 'finished';

  return (
    <div className="overlay" role="dialog" aria-labelledby="summary-title">
      <div className="panel summary">
        <h2 id="summary-title">{finished ? 'Match beendet' : `Runde ${result.roundNumber} – Auswertung`}</h2>
        {finished && match.winner && <p className="summary__winner">🏆 {sideLabel(view, match.winner)} gewinnt!</p>}
        <div className="summary__table-wrap">
          <table className="summary__table">
            <thead>
              <tr>
                <th />
                {score.stats.map((s) => (
                  <th key={s.sideId}>{sideLabel(view, s.sideId)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th>Karten</th>
                {score.stats.map((s) => (
                  <td key={s.sideId} className={score.mostCardsSide === s.sideId ? 'is-best' : ''}>
                    {s.cardCount}
                  </td>
                ))}
              </tr>
              <tr>
                <th>Kreuz ♣</th>
                {score.stats.map((s) => (
                  <td key={s.sideId} className={score.mostClubsSide === s.sideId ? 'is-best' : ''}>
                    {s.clubCount}
                  </td>
                ))}
              </tr>
              <tr>
                <th>Kreuz 2</th>
                {score.stats.map((s) => (
                  <td key={s.sideId}>{s.hasClubTwo ? '✓' : ''}</td>
                ))}
              </tr>
              <tr>
                <th>Karo 10</th>
                {score.stats.map((s) => (
                  <td key={s.sideId}>{s.hasDiamondTen ? '✓' : ''}</td>
                ))}
              </tr>
              <tr className="summary__points">
                <th>Rundenpunkte</th>
                {score.stats.map((s) => (
                  <td key={s.sideId}>+{s.points}</td>
                ))}
              </tr>
              <tr className="summary__total">
                <th>Gesamt</th>
                {score.stats.map((s) => (
                  <td key={s.sideId}>{result.scoresAfter[s.sideId] ?? 0}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <ul className="summary__notes muted">
          {score.mostCardsSide === null && <li>Kartenmehrheit: Gleichstand – keine Punkte.</li>}
          {score.mostClubsSide === null && <li>Kreuzmehrheit: Gleichstand – keine Punkte.</li>}
          {result.leftoverSide && result.leftoverCards.length > 0 && (
            <li>
              Restkarten <CardList cards={result.leftoverCards} separator=" " /> an {sideLabel(view, result.leftoverSide)}.
            </li>
          )}
        </ul>
        {!finished && deadline !== null && (
          <p className="muted">Nächste Runde in {Math.max(0, Math.ceil((deadline - now) / 1000))} s …</p>
        )}
        {finished &&
          (isHost ? (
            <button type="button" className="btn btn--primary btn--block" onClick={onReturnToLobby}>
              Zurück zur Lobby
            </button>
          ) : (
            <p className="muted">Der Host kann ein neues Match in der Lobby starten.</p>
          ))}
      </div>
    </div>
  );
}
