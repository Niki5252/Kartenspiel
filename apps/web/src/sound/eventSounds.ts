/**
 * Ordnet Server-Ereignisse Sounds zu (rein, testbar).
 * Verzögerungen sind an die Animations-Zeitpläne gekoppelt, damit Ton und Bild zusammenpassen.
 */
import type { MatchEvent, MatchTimings, PlayerCount, SideId } from '@orlan/game';
import { dealPacketCount, dealPacketSchedule, moveTimeline } from '../anim/timeline';
import type { SoundRequest } from './soundPlayer';

export interface SoundContext {
  playerCount: PlayerCount;
  timings: MatchTimings;
  /** Eigene Seite (Spieler oder Team); null für Zuschauer. */
  mySide: SideId | null;
  /** Zeitpunkte (ms) der Austeil-Töne aus dem Animationsplan (Pakete, Tischkarten, Buben). */
  dealSoundTimes?: number[];
}

export function soundsForEvents(events: readonly MatchEvent[], ctx: SoundContext): SoundRequest[] {
  const out: SoundRequest[] = [];
  for (const e of events) {
    switch (e.type) {
      case 'roundStarted':
        out.push({ name: 'shuffle' });
        break;
      case 'deckCut':
        out.push({ name: 'cut' });
        break;
      case 'cardsDealt': {
        if (ctx.dealSoundTimes) {
          for (const t of ctx.dealSoundTimes) out.push({ name: 'deal', delayMs: t });
        } else {
          const schedule = dealPacketSchedule(dealPacketCount(ctx.playerCount, e.initial), ctx.timings.dealMs);
          for (const p of schedule) out.push({ name: 'deal', delayMs: p.startMs + p.durationMs * 0.8 });
        }
        break;
      }
      case 'captureChoiceRequired':
        // Karte ist verbindlich gespielt und fliegt in die Mitte.
        out.push({ name: 'play', delayMs: moveTimeline(ctx.timings.moveAnimationMs).flyInEnd * 0.8 });
        break;
      case 'cardPlayed': {
        const t = moveTimeline(ctx.timings.moveAnimationMs);
        // Bei vorheriger Kombinationsauswahl lag die Karte schon in der Mitte (Sound bereits gespielt).
        if (!e.move.viaChoice) out.push({ name: 'play', delayMs: t.flyInEnd * 0.8 });
        if (e.move.captured.length > 0) out.push({ name: 'capture', delayMs: t.gatherEnd });
        break;
      }
      case 'roundEnded':
        out.push({ name: 'roundSummary', delayMs: 150 });
        break;
      case 'matchFinished':
        if (ctx.mySide !== null && e.winner === ctx.mySide) out.push({ name: 'matchWon', delayMs: 700 });
        break;
      default:
        break;
    }
  }
  return out;
}
