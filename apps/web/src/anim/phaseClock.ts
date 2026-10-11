import { useEffect, useMemo, useState } from 'react';
import { serverNow } from '../net/client';

export function prefersReducedMotion(): boolean {
  try {
    return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/**
 * Vergangene Zeit seit Beginn der aktuellen Serverphase.
 * Rendert nur an den übergebenen Meilensteinen neu (nicht jeden Frame).
 * Bei reduzierter Bewegung: sofort Endzustand (Infinity).
 */
export function usePhaseElapsed(phaseStartedAt: number, milestones: readonly number[]): number {
  const [, setTick] = useState(0);
  const key = milestones.join(',');
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const timers = milestones
      .map((m) => phaseStartedAt + m - serverNow())
      .filter((d) => d > 0)
      .map((d) => setTimeout(() => setTick((t) => t + 1), d + 4));
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phaseStartedAt, key]);
  return prefersReducedMotion() ? Number.POSITIVE_INFINITY : serverNow() - phaseStartedAt;
}

/**
 * Vergangene Zeit beim ersten Rendern dieser Phase – stabil für CSS-Animationen
 * (negativer animation-delay synchronisiert alle Clients auf denselben Moment).
 */
export function useMountElapsed(phaseStartedAt: number): number {
  return useMemo(() => (prefersReducedMotion() ? 1e9 : Math.max(0, serverNow() - phaseStartedAt)), [phaseStartedAt]);
}

/** Inline-Style, der eine CSS-Animation um `atMs` (relativ zum Phasenbeginn) verzögert startet. */
export function syncedDelay(atMs: number, mountElapsed: number): { animationDelay: string } {
  return { animationDelay: `${Math.round(atMs - mountElapsed)}ms` };
}
