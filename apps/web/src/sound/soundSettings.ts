/**
 * Lokale Sound-Einstellung (AN / STUMM) pro Browser. Reine Logik, Storage injizierbar (testbar).
 */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const SOUND_MUTED_KEY = 'orlan.sound.muted';

export interface SoundSettings {
  isMuted(): boolean;
  setMuted(muted: boolean): void;
  toggle(): boolean;
  subscribe(listener: () => void): () => void;
}

export function createSoundSettings(storage: KeyValueStorage | null): SoundSettings {
  let muted = false;
  try {
    muted = storage?.getItem(SOUND_MUTED_KEY) === 'true';
  } catch {
    muted = false;
  }
  const listeners = new Set<() => void>();
  const settings: SoundSettings = {
    isMuted: () => muted,
    setMuted(value) {
      if (value === muted) return;
      muted = value;
      try {
        storage?.setItem(SOUND_MUTED_KEY, String(value));
      } catch {
        // Ohne Storage gilt die Einstellung nur für diese Sitzung.
      }
      for (const l of listeners) l();
    },
    toggle() {
      settings.setMuted(!muted);
      return muted;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return settings;
}

function browserStorage(): KeyValueStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export const soundSettings = createSoundSettings(browserStorage());
