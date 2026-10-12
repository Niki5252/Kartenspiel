import { sideIdOfSeat } from '@orlan/game';
import { useEffect, useRef } from 'react';
import type { ClientState } from '../net/client';
import { dealPlan } from '../anim/timeline';
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
        dealSoundTimes: state.view && match.round.phase === 'dealing' ? dealSoundTimes(state.view) : undefined,
      }),
    );
  }, [state.lastEvents, state.view]);
}

/** Ein dezenter Kartenton pro Paket und pro aufgedeckter Tischkarte; beim Buben beim Aufdecken und beim Unterlegen. */
function dealSoundTimes(view: import('@orlan/protocol').RoomView): number[] {
  const plan = dealPlan(view);
  const times = plan.packets.map((p) => p.startMs + p.durationMs * 0.8);
  for (const s of plan.steps) {
    if (s.isJack) times.push(s.startMs + 200, s.atBottomMs ?? s.endMs);
    else times.push(s.endMs - 40);
  }
  return times.sort((a, b) => a - b);
}
