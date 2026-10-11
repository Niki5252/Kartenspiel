import type { RoomView } from '@orlan/protocol';
import { sideLabel } from '../lib/display';

/** Matchstand – während der gesamten Runde sichtbar. */
export function ScoreBar({ view }: { view: RoomView }) {
  const match = view.match;
  if (!match) return null;
  return (
    <div className="scorebar" aria-label="Punktestand">
      <div className="scorebar__meta">
        <span>Runde {match.round.number}</span>
        <span className="muted">Ziel {match.targetScore}</span>
      </div>
      <ul className={`scorebar__scores scorebar__scores--${match.sides.length}`}>
        {match.sides.map((side) => {
          const label = sideLabel(view, side.id);
          const points = match.scores[side.id] ?? 0;
          const captured = match.round.capturedCounts[side.id] ?? 0;
          return (
            <li
              key={side.id}
              className={`score ${match.winner === side.id ? 'is-winner' : ''}`}
              title={`${label}: ${points} Punkte · ${captured} Karten in dieser Runde`}
            >
              <span className="score__label">{label}</span>
              <strong className="score__value">{points}</strong>
              <small className="score__captured" aria-label={`${captured} Karten in dieser Runde`}>
                {captured} K
              </small>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
