import { PLAYER_COUNTS, type PlayerCount } from '@orlan/game';
import { PLAYER_NAME_MAX_LENGTH, ROOM_CODE_LENGTH } from '@orlan/protocol';
import { type FormEvent, useState } from 'react';
import { api } from '../net/client';
import { playerCountLabel } from '../lib/display';

const NAME_KEY = 'orlan.playerName';

function loadName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

function storeName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    /* ignorieren */
  }
}

export function HomeScreen({ exitReason, onDismissExit }: { exitReason: string | null; onDismissExit: () => void }) {
  const [name, setName] = useState(loadName);
  const [playerCount, setPlayerCount] = useState<PlayerCount>(2);
  const [code, setCode] = useState(() => new URLSearchParams(window.location.search).get('code')?.toUpperCase() ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(true);
    setError(null);
    storeName(name.trim());
    const res = await fn();
    setBusy(false);
    if (!res.ok) setError(res.error ?? 'Fehler');
  };

  const onCreate = (e: FormEvent) => {
    e.preventDefault();
    void run(() => api.createRoom(name, playerCount));
  };

  const onJoin = (e: FormEvent) => {
    e.preventDefault();
    void run(() => api.joinRoom(code, name));
  };

  return (
    <main className="home">
      <header className="home__header">
        <h1 className="logo">
          Orlan <span>Online</span>
        </h1>
        <p className="muted">Das Kartenspiel für 2, 3 oder 4 Spieler – direkt im Browser.</p>
      </header>

      {exitReason && (
        <div className="notice" role="status">
          <span>{exitReason}</span>
          <button type="button" className="btn btn--ghost btn--sm" onClick={onDismissExit}>
            OK
          </button>
        </div>
      )}

      <label className="field">
        <span>Dein Name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={PLAYER_NAME_MAX_LENGTH}
          placeholder="z. B. Nikola"
          autoComplete="nickname"
        />
      </label>

      <div className="home__panels">
        <form className="panel" onSubmit={onCreate}>
          <h2>Raum erstellen</h2>
          <div className="segmented" role="radiogroup" aria-label="Spielerzahl">
            {PLAYER_COUNTS.map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={playerCount === n}
                className={`segmented__option ${playerCount === n ? 'is-active' : ''}`}
                onClick={() => setPlayerCount(n)}
              >
                <strong>{n}</strong>
                <small>{n === 4 ? '2 Teams' : 'jeder gegen jeden'}</small>
              </button>
            ))}
          </div>
          <button className="btn btn--primary btn--block" disabled={busy || !name.trim()}>
            {playerCountLabel(playerCount)} – Raum erstellen
          </button>
        </form>

        <form className="panel" onSubmit={onJoin}>
          <h2>Raum beitreten</h2>
          <label className="field">
            <span>Raumcode</span>
            <input
              className="input--code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              maxLength={ROOM_CODE_LENGTH}
              placeholder="K7P4XZ"
              autoCapitalize="characters"
              autoComplete="off"
              inputMode="text"
            />
          </label>
          <button className="btn btn--secondary btn--block" disabled={busy || !name.trim() || code.length !== ROOM_CODE_LENGTH}>
            Beitreten
          </button>
        </form>
      </div>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </main>
  );
}
