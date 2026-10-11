import { useServerNow } from '../net/hooks';

interface Props {
  deadline: number | null;
  totalMs: number;
  label?: string;
}

/** Synchronisierter Zeitbalken: Grün -> Gelb -> Orange -> Rot. Basierend auf der Server-Deadline. */
export function TimerBar({ deadline, totalMs, label }: Props) {
  const now = useServerNow(deadline !== null);
  if (deadline === null) return <div className="timer timer--idle" aria-hidden="true" />;
  const remaining = Math.max(0, deadline - now);
  const fraction = Math.min(1, remaining / totalMs);
  // Farbton 130 (grün) -> 0 (rot)
  const hue = Math.round(130 * fraction);
  const seconds = Math.ceil(remaining / 1000);
  return (
    <div className="timer" role="timer" aria-label={`${label ?? 'Zeit'}: ${seconds} Sekunden`}>
      <div className="timer__fill" style={{ width: `${fraction * 100}%`, background: `hsl(${hue} 70% 48%)` }} />
      <span className="timer__label">
        {label ? `${label} · ` : ''}
        {seconds}s
      </span>
    </div>
  );
}
