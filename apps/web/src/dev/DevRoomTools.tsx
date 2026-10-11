import type { RoomView } from '@orlan/protocol';
import { devApi } from '../net/client';

/** Nur im Dev-Raum: Testspieler zwischen Mensch/Bot umschalten. */
export function DevRoomTools({ view }: { view: RoomView }) {
  return (
    <section className="panel dev-panel">
      <h2>🛠 Dev: Testspieler</h2>
      <ul className="player-list">
        {view.players.map((p) => (
          <li key={p.id} className="player-row">
            <span className="player-row__name">{p.name}</span>
            <label className="toggle">
              <input type="checkbox" checked={p.isBot} onChange={(e) => void devApi.setBot(p.id, e.target.checked)} />
              Bot spielt automatisch
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}
