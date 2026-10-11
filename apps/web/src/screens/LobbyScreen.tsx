import { MAX_TEAM_SIZE, type TeamNumber, requiresTeams } from '@orlan/game';
import type { PlayerPublic, RoomView } from '@orlan/protocol';
import { useState } from 'react';
import { useConfirm } from '../components/useConfirm';
import { DevRoomTools } from '../dev/DevRoomTools';
import { me, playerCountLabel } from '../lib/display';
import { api } from '../net/client';
import { useServerNow } from '../net/hooks';

export function LobbyScreen({ view }: { view: RoomView }) {
  const self = me(view);
  const isHost = view.myPlayerId === view.hostId;
  const teams = requiresTeams(view.maxPlayers);
  const { confirm, dialog } = useConfirm();
  const [error, setError] = useState<string | null>(null);

  const call = async (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    const res = await fn();
    setError(res.ok ? null : (res.error ?? 'Fehler'));
  };

  const shareUrl = `${window.location.origin}/?code=${view.code}`;
  const copy = (text: string) => void navigator.clipboard?.writeText(text).catch(() => {});

  const leave = () => {
    if (isHost) {
      confirm({
        title: 'Raum verlassen?',
        message: 'Du bist Host. Wenn du den Raum verlässt, wird er für alle geschlossen.',
        confirmLabel: 'Raum schließen',
        danger: true,
        action: () => void api.leaveRoom(),
      });
    } else {
      void api.leaveRoom();
    }
  };

  const kick = (p: PlayerPublic) =>
    confirm({
      title: 'Spieler entfernen?',
      message: `${p.name} wird aus dem Raum entfernt.`,
      confirmLabel: 'Entfernen',
      danger: true,
      action: () => void call(() => api.kick(p.id)),
    });

  const freeSlots = view.maxPlayers - view.players.length;

  return (
    <main className="lobby">
      <section className="panel lobby__code">
        <span className="muted">Raumcode · {playerCountLabel(view.maxPlayers)}</span>
        <button type="button" className="room-code" onClick={() => copy(view.code)} title="Code kopieren">
          {view.code}
        </button>
        <div className="row">
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => copy(view.code)}>
            Code kopieren
          </button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => copy(shareUrl)}>
            Link kopieren
          </button>
        </div>
      </section>

      {teams ? (
        <section className="lobby__teams">
          {([1, 2] as TeamNumber[]).map((team) => {
            const members = view.players.filter((p) => p.team === team);
            const full = members.length >= MAX_TEAM_SIZE;
            return (
              <div key={team} className={`panel team team--${team}`}>
                <h2>Team {team}</h2>
                <ul className="player-list">
                  {members.map((p) => (
                    <PlayerRow key={p.id} player={p} view={view} onKick={kick} />
                  ))}
                  {Array.from({ length: MAX_TEAM_SIZE - members.length }, (_, i) => (
                    <li key={`empty-${i}`} className="player-row player-row--empty">
                      frei
                    </li>
                  ))}
                </ul>
                {self?.team !== team && (
                  <button type="button" className="btn btn--secondary btn--block" disabled={full} onClick={() => void call(() => api.setTeam(team))}>
                    {full ? 'Team voll' : `Team ${team} beitreten`}
                  </button>
                )}
              </div>
            );
          })}
          {view.players.some((p) => p.team === null) && (
            <div className="panel">
              <h2>Ohne Team</h2>
              <ul className="player-list">
                {view.players
                  .filter((p) => p.team === null)
                  .map((p) => (
                    <PlayerRow key={p.id} player={p} view={view} onKick={kick} />
                  ))}
              </ul>
            </div>
          )}
        </section>
      ) : (
        <section className="panel">
          <h2>Spieler</h2>
          <ul className="player-list">
            {view.players.map((p) => (
              <PlayerRow key={p.id} player={p} view={view} onKick={kick} />
            ))}
            {Array.from({ length: freeSlots }, (_, i) => (
              <li key={`empty-${i}`} className="player-row player-row--empty">
                wartet auf Spieler …
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="lobby__actions">
        {view.notice && <p className="notice">{view.notice}</p>}
        {view.status === 'lobby' && view.startBlockers.length > 0 && (
          <ul className="blockers muted">
            {view.startBlockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        )}
        {self && (
          <button
            type="button"
            className={`btn btn--block btn--lg ${self.ready ? 'btn--ghost' : 'btn--primary'}`}
            disabled={teams && self.team === null}
            onClick={() => void call(() => api.setReady(!self.ready))}
          >
            {self.ready ? 'Nicht bereit' : 'Bereit'}
          </button>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button type="button" className="btn btn--ghost btn--sm" onClick={leave}>
          Raum verlassen
        </button>
      </section>

      {view.isDevRoom && import.meta.env.DEV && <DevRoomTools view={view} />}
      {view.status === 'countdown' && <Countdown endsAt={view.countdownEndsAt} />}
      {dialog}
    </main>
  );
}

function PlayerRow({ player, view, onKick }: { player: PlayerPublic; view: RoomView; onKick: (p: PlayerPublic) => void }) {
  const isHost = view.myPlayerId === view.hostId;
  const isMe = player.id === view.myPlayerId;
  return (
    <li className={`player-row ${isMe ? 'is-me' : ''}`}>
      <span className={`status-dot ${player.connected ? 'is-online' : 'is-offline'}`} title={player.connected ? 'verbunden' : 'Verbindung verloren'} />
      <span className="player-row__name">
        {player.name}
        {isMe && <span className="tag">du</span>}
        {player.isHost && <span className="tag tag--host">Host</span>}
        {player.isBot && <span className="tag">Bot</span>}
        {!player.connected && <span className="tag tag--warn">Verbindung verloren</span>}
      </span>
      <span className={`ready-badge ${player.ready ? 'is-ready' : ''}`}>{player.ready ? 'bereit' : 'nicht bereit'}</span>
      {isHost && !isMe && (
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => onKick(player)} aria-label={`${player.name} entfernen`}>
          ✕
        </button>
      )}
    </li>
  );
}

function Countdown({ endsAt }: { endsAt: number | null }) {
  const now = useServerNow(endsAt !== null);
  if (endsAt === null) return null;
  const seconds = Math.max(1, Math.ceil((endsAt - now) / 1000));
  return (
    <div className="countdown" role="status" aria-live="assertive">
      <span key={seconds} className="countdown__number">
        {seconds}
      </span>
    </div>
  );
}
