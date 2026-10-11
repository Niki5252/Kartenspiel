import type { RoomView } from '@orlan/protocol';
import { sideLabel } from '../lib/display';

/** Matchstand – während der gesamten Runde sichtbar. */
export function ScoreBar({ view }: { view: RoomView }) {
  const match = view.match;
  if (!match) return null;
  return (
    <div className="scorebar" aria-label="Punktestand">
      <span className="scorebar__round">Runde {match.round.number}</span>
      <ul className="scorebar__scores">
        {match.sides.map((side) => (
          <li key={side.id} className={`score ${match.winner === side.id ? 'is-winner' : ''}`}>
            <span className="score__label">{sideLabel(view, side.id)}</span>
            <strong className="score__value">{match.scores[side.id] ?? 0}</strong>
            <small className="score__captured" title="In dieser Runde gesammelte Karten">
              {match.round.capturedCounts[side.id] ?? 0} K
            </small>
          </li>
        ))}
      </ul>
      <span className="scorebar__target muted">Ziel {match.targetScore}</span>
    </div>
  );
}
