/**
 * Was der Timer-Balken gerade zeigen soll – rein, testbar.
 * Aus Sicht des handelnden Spielers lautet die Beschriftung "Dein Zug · 24 s" usw.
 */
import type { RoomView } from '@orlan/protocol';
import { playerAtSeat } from './display';

export type TimerKind = 'turn' | 'cut' | 'dealOrder';

export interface TimerDisplay {
  kind: TimerKind;
  /** Der Betrachter muss gerade selbst handeln. */
  isMine: boolean;
  label: string;
  secondsLeft: number;
  /** 1 = volle Zeit, 0 = abgelaufen */
  fraction: number;
  /** Farbton: 130 grün -> ~55 gelb -> ~30 orange -> 0 rot */
  hue: number;
  totalMs: number;
}

export function timerHue(fraction: number): number {
  return Math.round(130 * Math.min(1, Math.max(0, fraction)));
}

export function timerDisplay(view: RoomView, now: number): TimerDisplay | null {
  const match = view.match;
  if (!match || match.status !== 'running') return null;
  const r = match.round;
  if (r.deadline === null) return null;

  let kind: TimerKind;
  let actor: number | null;
  let totalMs: number;
  if (r.phase === 'turn' || r.phase === 'choosingCapture') {
    kind = 'turn';
    actor = r.phase === 'turn' ? r.currentSeat : (r.pending?.seat ?? null);
    totalMs = match.timings.turnMs;
  } else if (r.phase === 'cutting') {
    kind = 'cut';
    actor = r.cutterSeat;
    totalMs = match.timings.cutMs;
  } else if (r.phase === 'choosingDealOrder') {
    kind = 'dealOrder';
    actor = r.cutterSeat;
    totalMs = match.timings.dealOrderMs;
  } else {
    return null;
  }
  if (actor === null) return null;

  const remaining = Math.max(0, r.deadline - now);
  const fraction = Math.min(1, remaining / totalMs);
  const secondsLeft = Math.ceil(remaining / 1000);
  const isMine = actor === match.mySeat;
  const name = playerAtSeat(view, actor)?.name ?? 'Spieler';
  const text = {
    turn: isMine ? 'Dein Zug' : `${name} ist am Zug`,
    cut: isMine ? 'Du schneidest' : `${name} schneidet`,
    dealOrder: isMine ? 'Du wählst' : `${name} wählt`,
  }[kind];
  return { kind, isMine, label: `${text} · ${secondsLeft} s`, secondsLeft, fraction, hue: timerHue(fraction), totalMs };
}
