import type { RoomView } from '@orlan/protocol';
import type { CSSProperties } from 'react';
import { timerDisplay } from '../lib/timerDisplay';
import { useServerNow } from '../net/hooks';

/**
 * Synchronisierter Zeitbalken (Grün -> Gelb -> Orange -> Rot), berechnet aus der Server-Deadline.
 * `prominent`: große, deutlich hervorgehobene Variante, wenn der Betrachter selbst handeln muss.
 */
export function PhaseTimer({ view, prominent = false }: { view: RoomView; prominent?: boolean }) {
  const active = view.match?.round.deadline != null;
  const now = useServerNow(active);
  const t = timerDisplay(view, now);
  if (!t) return <div className="timer timer--idle" aria-hidden="true" />;
  const urgent = t.secondsLeft <= 5;
  return (
    <div
      className={`timer ${prominent ? 'timer--mine' : ''} ${prominent && urgent ? 'timer--urgent' : ''}`}
      role="timer"
      aria-live={prominent ? 'polite' : 'off'}
      aria-label={t.label}
      style={{ '--timer-hue': t.hue } as CSSProperties}
    >
      <div className="timer__fill" style={{ width: `${t.fraction * 100}%`, background: `hsl(${t.hue} 72% 46%)` }} />
      <span className="timer__label">{t.label}</span>
    </div>
  );
}
