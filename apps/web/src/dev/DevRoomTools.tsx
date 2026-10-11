import { type PlayerCount, isValidSeatPlan, teamOfSeat } from '@orlan/game';
import type { RoomView } from '@orlan/protocol';
import { useState } from 'react';
import { devApi } from '../net/client';

/** Position aus Sicht von Sitz 1 – nur zur Orientierung (jeder Client sieht sich selbst unten). */
const POSITION_FROM_SEAT1 = ['unten', 'rechts', 'oben', 'links'];

/** Nur im Dev-Raum: Testspieler zwischen Mensch/Bot umschalten und (4 Spieler) Sitzplätze gezielt belegen. */
export function DevRoomTools({ view }: { view: RoomView }) {
  const [error, setError] = useState<string | null>(null);
  const run = async (p: Promise<{ ok: boolean; error?: string }>) => {
    const res = await p;
    setError(res.ok ? null : (res.error ?? 'Fehler'));
  };
  const plan = view.seatPlan ?? new Array(view.maxPlayers).fill(null);
  const planValid = isValidSeatPlan(view.maxPlayers as PlayerCount, view.players, plan);

  return (
    <section className="panel dev-panel">
      <h2>🛠 Dev: Testspieler</h2>
      <ul className="player-list">
        {view.players.map((p) => (
          <li key={p.id} className="player-row">
            <span className="player-row__name">{p.name}</span>
            <label className="toggle">
              <input type="checkbox" checked={p.isBot} onChange={(e) => void run(devApi.setBot(p.id, e.target.checked))} />
              Bot spielt automatisch
            </label>
          </li>
        ))}
      </ul>

      {view.maxPlayers === 4 && (
        <>
          <h2>🛠 Dev: Sitzplätze & Teams</h2>
          <p className="muted small">
            Sitz 1 + 3 = Team 1, Sitz 2 + 4 = Team 2 – Teamkollegen sitzen immer gegenüber. Das Team folgt dem Sitz; ein
            belegter Sitz wird getauscht.
          </p>
          <div className="seat-plan">
            {plan.map((playerId, seat) => (
              <label key={seat} className={`seat-plan__row seat-plan__row--team${teamOfSeat(seat)}`}>
                <span className="seat-plan__label">
                  <strong>Sitz {seat + 1}</strong> · Team {teamOfSeat(seat)}
                  <small className="muted"> ({POSITION_FROM_SEAT1[seat]} aus Sicht von Sitz 1)</small>
                </span>
                <select
                  value={playerId ?? ''}
                  aria-label={`Spieler auf Sitz ${seat + 1}`}
                  onChange={(e) => e.target.value && void run(devApi.assignSeat(e.target.value, seat))}
                >
                  <option value="">— frei —</option>
                  {view.players.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <p className={`small ${planValid ? 'seat-plan__ok' : 'muted'}`}>
            {planValid ? '✓ Sitzplan vollständig – wird beim Matchstart verwendet.' : 'Sitzplan unvollständig – beim Start gilt die normale Vergabe nach Teams.'}
          </p>
        </>
      )}
      {error && <p className="error">{error}</p>}
    </section>
  );
}
