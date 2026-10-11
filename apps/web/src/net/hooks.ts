import { useEffect, useState, useSyncExternalStore } from 'react';
import { type ClientState, getState, serverNow, subscribe } from './client';

export function useClientState(): ClientState {
  return useSyncExternalStore(subscribe, getState);
}

/** Liefert die aktuelle (geschätzte) Serverzeit und aktualisiert sie per requestAnimationFrame, solange `active`. */
export function useServerNow(active: boolean): number {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    if (!active) return;
    let frame = 0;
    const loop = () => {
      setNow(serverNow());
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [active]);
  return active ? now : serverNow();
}
