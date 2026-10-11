/**
 * Development/Test Mode: erzeugt einen Raum mit 2–4 Testspielern.
 * Nur im Development-Build enthalten (siehe App.tsx) und nur nutzbar, wenn der Server mit ORLAN_DEV_MODE=true läuft.
 */
import type { DevTestPlayer, DevTestRoom } from '@orlan/protocol';
import { useState } from 'react';
import { devApi } from '../net/client';

function playerUrl(room: DevTestRoom, player: DevTestPlayer, extra: Record<string, string> = {}): string {
  const params = new URLSearchParams({ profile: player.playerId, room: room.roomCode, pid: player.playerId, token: player.token, ...extra });
  return `/?${params.toString()}`;
}

export function DevLauncher() {
  const [playerCount, setPlayerCount] = useState<2 | 3 | 4>(4);
  const [botCount, setBotCount] = useState(0);
  const [autoReady, setAutoReady] = useState(false);
  const [room, setRoom] = useState<DevTestRoom | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [split, setSplit] = useState(true);
  const [hostName, setHostName] = useState(() => {
    try {
      return localStorage.getItem('orlan.playerName') ?? '';
    } catch {
      return '';
    }
  });

  const create = async () => {
    const res = await devApi.createTestRoom(playerCount, Math.min(botCount, playerCount - 1), autoReady, hostName.trim() || undefined);
    if (res.ok) {
      setRoom(res.data);
      setError(null);
    } else setError(res.error);
  };

  const humans = room?.players.filter((p) => !p.isBot) ?? [];

  if (room && split) {
    return (
      <div className="dev-split">
        <div className="dev-split__bar">
          <strong>🛠 Dev-Split-Screen · Raum {room.roomCode}</strong>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setSplit(false)}>
            Links anzeigen
          </button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setRoom(null)}>
            Neuer Testraum
          </button>
        </div>
        <div className={`dev-split__grid dev-split__grid--${humans.length}`}>
          {humans.map((p) => (
            <iframe key={p.playerId} title={p.name} src={playerUrl(room, p)} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <main className="home">
      <h1 className="logo">
        Orlan <span>Dev</span>
      </h1>
      <p className="muted">Development/Test Mode – nicht in der Produktionsversion verfügbar.</p>

      <section className="panel">
        <h2>Testraum erstellen</h2>
        <label className="field">
          <span>Dein Name (Host) – weitere Testspieler heißen P2, P3, P4</span>
          <input value={hostName} onChange={(e) => setHostName(e.target.value)} maxLength={20} placeholder="P1" />
        </label>
        <div className="segmented">
          {([2, 3, 4] as const).map((n) => (
            <button key={n} type="button" className={`segmented__option ${playerCount === n ? 'is-active' : ''}`} onClick={() => setPlayerCount(n)}>
              <strong>{n}</strong>
              <small>Testspieler</small>
            </button>
          ))}
        </div>
        <label className="field">
          <span>Davon automatische Bots: {Math.min(botCount, playerCount - 1)}</span>
          <input type="range" min={0} max={playerCount - 1} value={Math.min(botCount, playerCount - 1)} onChange={(e) => setBotCount(Number(e.target.value))} />
        </label>
        <label className="toggle">
          <input type="checkbox" checked={autoReady} onChange={(e) => setAutoReady(e.target.checked)} />
          Alle sofort bereit (Countdown startet direkt)
        </label>
        <button type="button" className="btn btn--primary btn--block" onClick={() => void create()}>
          Testraum erstellen
        </button>
        {error && <p className="error">{error}</p>}
      </section>

      {room && (
        <section className="panel">
          <h2>Raum {room.roomCode}</h2>
          <p className="muted small">Jeder Link öffnet einen eigenen Spieler (eigener Tab/eigenes Fenster).</p>
          <ul className="player-list">
            {room.players.map((p) => (
              <li key={p.playerId} className="player-row">
                <span className="player-row__name">
                  {p.name} {p.isBot && <span className="tag">Bot</span>}
                </span>
                {!p.isBot && (
                  <a className="btn btn--ghost btn--sm" href={playerUrl(room, p)} target="_blank" rel="noreferrer">
                    In neuem Tab öffnen
                  </a>
                )}
              </li>
            ))}
          </ul>
          <button type="button" className="btn btn--secondary btn--block" onClick={() => setSplit(true)}>
            Split-Screen anzeigen
          </button>
        </section>
      )}
    </main>
  );
}
