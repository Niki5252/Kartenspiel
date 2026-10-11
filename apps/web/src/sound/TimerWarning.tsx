import type { RoomView } from '@orlan/protocol';
import { useEffect, useRef } from 'react';
import { serverNow } from '../net/client';
import { soundPlayer } from './soundPlayer';
import { timerWarningDelay } from './timerWarningSchedule';

/** Spielt einmal pro Zug einen leisen Hinweiston, wenn die eigene Zeit fast abgelaufen ist. */
export function TimerWarning({ view }: { view: RoomView }) {
  const warned = useRef<string | null>(null);
  const plan = timerWarningDelay(view, serverNow());
  const key = plan?.key ?? null;
  useEffect(() => {
    if (!plan || warned.current === plan.key) return;
    const id = setTimeout(() => {
      warned.current = plan.key;
      soundPlayer.play('timerWarning');
    }, plan.delayMs);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return null;
}
