import type { RoomView } from '@orlan/protocol';

/** Ab dieser Restzeit warnt ein dezenter Ton – nur den Spieler, der gerade handeln muss. */
export const TIMER_WARNING_MS = 3000;

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
  return { key: `${r.number}-${phaseKey}-${r.deadline}`, delayMs: Math.max(0, remaining - TIMER_WARNING_MS) };
}
