import type { RoomView } from '@orlan/protocol';

/**
 * Bei dieser Restzeit warnt EINMAL ein dezenter Ton – nur den Spieler, der gerade handeln muss.
 * Zug (30 s) und Schneiden (15 s): 5 s vorher. Kurze Wahl "Spieler/Tisch zuerst" (7 s): 3 s vorher.
 */
export const TIMER_WARNING_MS = 5000;
export const SHORT_TIMER_WARNING_MS = 3000;

/**
 * Millisekunden bis zur Warnung (0 = jetzt), oder null, wenn für diesen Client keine Warnung ansteht.
 * Rein, testbar.
 */
export function timerWarningDelay(view: RoomView, now: number): { key: string; delayMs: number } | null {
  const match = view.match;
  if (!match || match.status !== 'running' || match.mySeat === null) return null;
  const r = match.round;
  if (r.deadline === null) return null;
  const actor =
    r.phase === 'turn'
      ? r.currentSeat
      : r.phase === 'choosingCapture'
        ? (r.pending?.seat ?? null)
        : r.phase === 'cutting' || r.phase === 'choosingDealOrder'
          ? r.cutterSeat
          : null;
  if (actor !== match.mySeat) return null;
  const remaining = r.deadline - now;
  if (remaining <= 0) return null;
  // choosingCapture teilt die Deadline des Zuges -> gleicher Schlüssel, keine doppelte Warnung.
  const phaseKey = r.phase === 'choosingCapture' ? 'turn' : r.phase;
  const warnAt = r.phase === 'choosingDealOrder' ? SHORT_TIMER_WARNING_MS : TIMER_WARNING_MS;
  return { key: `${r.number}-${phaseKey}-${r.deadline}`, delayMs: Math.max(0, remaining - warnAt) };
}
