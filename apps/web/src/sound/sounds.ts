/**
 * Katalog der Spielsounds.
 *
 * AUSTAUSCHEN: Eine Audiodatei nach `apps/web/public/sounds/` legen und unten in SOUND_FILES eintragen,
 * z. B. `shuffle: '/sounds/shuffle.mp3'`. Ohne Eintrag wird der synthetische Platzhalter verwendet.
 */
export type SoundName = 'shuffle' | 'deal' | 'play' | 'capture' | 'cut' | 'timerWarning' | 'roundSummary' | 'matchWon';

export const SOUND_NAMES: readonly SoundName[] = ['shuffle', 'deal', 'play', 'capture', 'cut', 'timerWarning', 'roundSummary', 'matchWon'];

/** Optionale echte Audiodateien (haben Vorrang vor den Platzhaltern). */
export const SOUND_FILES: Partial<Record<SoundName, string>> = {};

/** Gesamtlautstärke – bewusst leise. */
export const MASTER_VOLUME = 0.35;

// ---------------------------------------------------------------------------
// Synthetische Platzhalter (WebAudio, keine Dateien nötig)
// ---------------------------------------------------------------------------

type Synth = (ctx: AudioContext, out: AudioNode, at: number) => void;

function noiseBuffer(ctx: AudioContext): AudioBuffer {
  const cached = (ctx as AudioContext & { __noise?: AudioBuffer }).__noise;
  if (cached) return cached;
  const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  (ctx as AudioContext & { __noise?: AudioBuffer }).__noise = buffer;
  return buffer;
}

/** Kurzer gefilterter Rauschimpuls – klingt wie das Schnippen einer Karte. */
function flick(ctx: AudioContext, out: AudioNode, at: number, opts: { freq: number; q?: number; dur: number; gain: number }): void {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = opts.freq;
  filter.Q.value = opts.q ?? 1.2;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(opts.gain, at + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, at + opts.dur);
  src.connect(filter).connect(g).connect(out);
  src.start(at, Math.random() * 0.3);
  src.stop(at + opts.dur + 0.02);
}

function tone(ctx: AudioContext, out: AudioNode, at: number, opts: { freq: number; dur: number; gain: number; type?: OscillatorType }): void {
  const osc = ctx.createOscillator();
  osc.type = opts.type ?? 'sine';
  osc.frequency.value = opts.freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(opts.gain, at + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, at + opts.dur);
  osc.connect(g).connect(out);
  osc.start(at);
  osc.stop(at + opts.dur + 0.02);
}

export const SYNTHS: Record<SoundName, Synth> = {
  // Riffle: viele sehr kurze Schnipser, leicht beschleunigend
  shuffle: (ctx, out, at) => {
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < 12; i++) flick(ctx, out, at + pass * 0.75 + i * 0.045, { freq: 2600 + i * 60, dur: 0.035, gain: 0.25 });
    }
  },
  deal: (ctx, out, at) => flick(ctx, out, at, { freq: 1800, dur: 0.09, gain: 0.35, q: 0.8 }),
  play: (ctx, out, at) => {
    flick(ctx, out, at, { freq: 1200, dur: 0.07, gain: 0.45, q: 0.7 });
    tone(ctx, out, at, { freq: 140, dur: 0.08, gain: 0.12 });
  },
  capture: (ctx, out, at) => {
    for (let i = 0; i < 3; i++) flick(ctx, out, at + i * 0.06, { freq: 1500 + i * 400, dur: 0.12, gain: 0.25, q: 0.6 });
  },
  cut: (ctx, out, at) => {
    flick(ctx, out, at, { freq: 2200, dur: 0.06, gain: 0.3 });
    flick(ctx, out, at + 1.15, { freq: 1600, dur: 0.08, gain: 0.3 });
  },
  timerWarning: (ctx, out, at) => {
    tone(ctx, out, at, { freq: 880, dur: 0.07, gain: 0.08 });
    tone(ctx, out, at + 0.18, { freq: 880, dur: 0.07, gain: 0.08 });
  },
  roundSummary: (ctx, out, at) => {
    tone(ctx, out, at, { freq: 659, dur: 0.35, gain: 0.1, type: 'triangle' });
    tone(ctx, out, at + 0.16, { freq: 880, dur: 0.45, gain: 0.1, type: 'triangle' });
  },
  matchWon: (ctx, out, at) => {
    [523, 659, 784, 1047].forEach((f, i) => tone(ctx, out, at + i * 0.13, { freq: f, dur: 0.5, gain: 0.11, type: 'triangle' }));
  },
};
