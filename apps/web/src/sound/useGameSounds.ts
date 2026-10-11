import { sideIdOfSeat } from '@orlan/game';
import { useEffect, useRef } from 'react';
import type { ClientState } from '../net/client';
import { soundsForEvents } from './eventSounds';
import { soundPlayer } from './soundPlayer';

/** Spielt Sounds zu neuen Server-Ereignissen. Bei Reconnect werden keine alten Ereignisse nachgespielt. */
export function useGameSounds(state: ClientState): void {
  const lastSeq = useRef(state.lastEvents.seq);
  useEffect(() => {
    if (state.lastEvents.seq === lastSeq.current) return;
    lastSeq.current = state.lastEvents.seq;
    const match = state.view?.match;
    if (!match) return;
    soundPlayer.playAll(
      soundsForEvents(state.lastEvents.events, {
        playerCount: match.playerCount,
        timings: match.timings,
        mySide: match.mySeat === null ? null : sideIdOfSeat(match.mySeat, match.playerCount),
      }),
    );
  }, [state.lastEvents, state.view]);
}
