/**
 * Overlay für Flug-Animationen (Karte zur Mitte, Aufnahme zum Spieler, Pakete beim Austeilen, Dealer-Chip).
 * - Positionen kommen aus den echten DOM-Elementen (data-anchor) -> passt auf jeder Bildschirmgröße.
 * - Zeitpunkt kommt aus der Serverzeit -> alle Clients sehen denselben Moment, Reconnect setzt korrekt fort.
 * - Das Overlay ist fixiert und schneidet ab (overflow hidden) -> nie horizontales Scrollen.
 * - Reine Darstellung: Es liest nur, es verändert keinen Zustand.
 */
import { useLayoutEffect, useRef } from 'react';
import { CardBack, PlayingCard } from '../components/PlayingCard';
import { serverNow } from '../net/client';
import { prefersReducedMotion } from './phaseClock';
import { type Flight, activeFlights, flightsEnd } from './timeline';

interface Props {
  flights: Flight[];
  phaseStartedAt: number;
}

export function FlyLayer({ flights, phaseStartedAt }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const key = `${phaseStartedAt}|${flights.map((f) => f.key).join(',')}`;

  useLayoutEffect(() => {
    const root = ref.current;
    if (!root || prefersReducedMotion() || typeof Element.prototype.animate !== 'function') return;
    const elapsed = serverNow() - phaseStartedAt;
    const running: Animation[] = [];

    for (const flight of activeFlights(flights, elapsed)) {
      const node = root.querySelector<HTMLElement>(`[data-flight="${CSS.escape(flight.key)}"]`);
      const total = flightsEnd([flight]);
      if (!node || total <= 0) continue;
      const w = node.offsetWidth;
      const h = node.offsetHeight;
      const points = flight.waypoints.map((wp) => {
        const el = document.querySelector<HTMLElement>(`[data-anchor="${CSS.escape(wp.anchor)}"]`);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const x = Math.min(Math.max(r.left + r.width / 2, w / 2), window.innerWidth - w / 2);
        const y = Math.min(Math.max(r.top + r.height / 2 + (wp.dy ?? 0), h / 2), window.innerHeight - h / 2);
        return { wp, x, y };
      });
      if (points.some((p) => p === null)) continue;
      const first = points[0]!.wp.at;
      const keyframes: Keyframe[] = [];
      // Vor dem ersten Wegpunkt unsichtbar warten (z. B. gestaffelte Pakete).
      if (first > 0) keyframes.push({ offset: 0, opacity: 0, transform: tf(points[0]!, w, h) });
      for (const p of points) {
        keyframes.push({
          offset: p!.wp.at / total,
          opacity: p!.wp.opacity ?? 1,
          transform: tf(p!, w, h),
          easing: 'cubic-bezier(.25,.75,.3,1)',
        });
      }
      if (first > 0) keyframes[1]!.opacity = 0; // Start exakt am ersten Wegpunkt
      const anim = node.animate(keyframes, { duration: total, fill: 'both' });
      anim.currentTime = Math.max(0, elapsed);
      anim.onfinish = () => {
        node.style.visibility = 'hidden';
      };
      node.style.visibility = 'visible';
      running.push(anim);
    }
    return () => running.forEach((a) => a.cancel());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (
    <div ref={ref} className="fly-layer" aria-hidden="true">
      {flights.map((f) => (
        <div key={f.key} data-flight={f.key} className={`flight flight--${f.kind} ${f.highlight ? "flight--highlight" : ""}`}>
          {f.kind === 'card' && f.card && <PlayingCard card={f.card} />}
          {f.kind === 'packet' && (
            <div className="flight__packet">
              <CardBack size="sm" />
              <CardBack size="sm" />
              <CardBack size="sm" />
            </div>
          )}
          {f.kind === 'chip' && <span className="dealer-chip">D</span>}
        </div>
      ))}
    </div>
  );
}

function tf(p: { x: number; y: number; wp: { scale?: number } }, w: number, h: number): string {
  return `translate(${Math.round(p.x - w / 2)}px, ${Math.round(p.y - h / 2)}px) scale(${p.wp.scale ?? 1})`;
}
