import type { SeatDisplay } from '../lib/display';
import { CardBack } from './PlayingCard';

interface Props {
  display: SeatDisplay;
  handCount: number;
  isActive: boolean;
}

/**
 * Spielerbereich am Tisch.
 * Zeile 1: der echte Spielername (bei Bedarf gekürzt). Zeile 2: Rollen-Badges (Dealer, Host, Team, Verbindung).
 * Die Badges stehen getrennt vom Namen, damit sie die Position nicht verschieben.
 */
export function SeatBadge({ display, handCount, isActive }: Props) {
  const { name, position, isMe, roles, team, connected } = display;
  return (
    <div className={`seat seat--${position} ${isActive ? 'is-active' : ''} ${isMe ? 'is-me' : ''} ${team ? `seat--team${team}` : ''}`}>
      <span className="seat__name" title={name}>
        {name}
        {isMe && <span className="seat__you"> (du)</span>}
      </span>
      <span className="seat__roles">
        {roles.includes('dealer') && (
          <span className="dealer-chip" title="Dealer" aria-label="Dealer">
            D
          </span>
        )}
        {roles.includes('host') && <span className="tag tag--host">Host</span>}
        {team && <span className="tag">Team {team}</span>}
        {!connected && <span className="tag tag--warn">Verbindung verloren</span>}
      </span>
      {!isMe && (
        <div className="seat__hand" aria-label={`${handCount} Handkarten`}>
          {Array.from({ length: handCount }, (_, i) => (
            <CardBack key={i} size="xs" />
          ))}
        </div>
      )}
    </div>
  );
}
