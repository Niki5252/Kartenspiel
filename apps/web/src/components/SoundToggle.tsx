import { useSyncExternalStore } from 'react';
import { soundSettings } from '../sound/soundSettings';

/** AN / STUMM – gilt lokal für diesen Browser. */
export function SoundToggle() {
  const muted = useSyncExternalStore(soundSettings.subscribe, soundSettings.isMuted);
  return (
    <button
      type="button"
      className="btn btn--ghost btn--sm sound-toggle"
      onClick={() => soundSettings.toggle()}
      aria-pressed={!muted}
      aria-label={muted ? 'Sound ist stumm – einschalten' : 'Sound ist an – stumm schalten'}
      title={muted ? 'Sound: STUMM' : 'Sound: AN'}
    >
      <span aria-hidden="true">{muted ? '🔇' : '🔊'}</span>
    </button>
  );
}
