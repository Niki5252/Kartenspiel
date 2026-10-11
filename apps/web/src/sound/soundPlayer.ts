/**
 * Spielt Sounds "fire and forget": blockiert nie, wirft nie, verzögert keine Spiellogik.
 * Der AudioContext wird erst nach der ersten Nutzerinteraktion erzeugt (Browser-Autoplay-Regeln).
 */
import { MASTER_VOLUME, SOUND_FILES, SYNTHS, type SoundName } from './sounds';
import { type SoundSettings, soundSettings } from './soundSettings';

export interface SoundBackend {
  /** Spielt `name` nach `delayMs`. Darf fehlschlagen, ohne zu werfen. */
  play(name: SoundName, delayMs: number): void;
}

export interface SoundRequest {
  name: SoundName;
  delayMs?: number;
}

export class SoundPlayer {
  constructor(
    private readonly settings: SoundSettings,
    private readonly backend: SoundBackend,
  ) {}

  play(name: SoundName, delayMs = 0): void {
    if (this.settings.isMuted()) return;
    try {
      this.backend.play(name, Math.max(0, delayMs));
    } catch {
      // Sound ist optional.
    }
  }

  playAll(requests: readonly SoundRequest[]): void {
    for (const r of requests) this.play(r.name, r.delayMs);
  }
}

/** WebAudio-Backend: echte Dateien, falls in SOUND_FILES eingetragen, sonst synthetische Platzhalter. */
class WebAudioBackend implements SoundBackend {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private readonly buffers = new Map<SoundName, AudioBuffer | 'loading' | 'failed'>();

  unlock(): void {
    if (typeof window === 'undefined') return;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    if (!this.ctx) {
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = MASTER_VOLUME;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  play(name: SoundName, delayMs: number): void {
    const ctx = this.ctx;
    const out = this.master;
    if (!ctx || !out || ctx.state !== 'running') return; // noch keine Interaktion -> still
    const at = ctx.currentTime + delayMs / 1000;
    const file = SOUND_FILES[name];
    if (file) {
      const buffer = this.buffers.get(name);
      if (buffer instanceof AudioBuffer) {
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.connect(out);
        src.start(at);
        return;
      }
      if (buffer === undefined) this.load(name, file);
      if (buffer !== 'failed') return;
    }
    SYNTHS[name](ctx, out, at);
  }

  private load(name: SoundName, url: string): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    this.buffers.set(name, 'loading');
    fetch(url)
      .then((r) => r.arrayBuffer())
      .then((data) => ctx.decodeAudioData(data))
      .then((buf) => this.buffers.set(name, buf))
      .catch(() => this.buffers.set(name, 'failed'));
  }
}

const backend = new WebAudioBackend();

if (typeof window !== 'undefined') {
  const unlock = () => backend.unlock();
  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock);
}

export const soundPlayer = new SoundPlayer(soundSettings, backend);
