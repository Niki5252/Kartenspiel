import type { PlayerPublic } from '@orlan/protocol';
import type { ScreenPosition } from '@orlan/game';
import { CardBack } from './PlayingCard';

interface Props {
  player: PlayerPublic | undefined;
  position: ScreenPosition;
  handCount: number;
  isDealer: boolean;
  isActive: boolean;
  isMe: boolean;
  team: number | null;
}

/** Spielerbereich am Tisch: Name, Dealer-Chip, aktiver Spieler, Verbindung, verdeckte Handkarten. */
export function SeatBadge({ player, position, handCount, isDealer, isActive, isMe, team }: Props) {
  return (
    <div className={`seat seat--${position} ${isActive ? 'is-active' : ''} ${isMe ? 'is-me' : ''} ${team ? `seat--team${team}` : ''}`}>
      <div className="seat__badge">
        {isDealer && (
          <span className="dealer-chip" title="Dealer">
            D
          </span>
        )}
        <span className="seat__name">{player?.name ?? '—'}</span>
        {team && <span className="tag">Team {team}</span>}
        {player && !player.connected && <span className="tag tag--warn">Verbindung verloren</span>}
      </div>
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
