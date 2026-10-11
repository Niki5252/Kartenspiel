import type { CSSProperties } from 'react';
import type { PileDisplay } from '../lib/piles';

/** Verdeckter, dezenter Kartenhaufen – ohne Zahl; wird mit mehr Karten dicker. */
export function CapturedPile({ pile }: { pile: PileDisplay }) {
  const label = `${pile.team ? `Team ${pile.team}: ` : ''}gesammelte Karten`;
  return (
    <span
      className={`pile ${pile.team ? `pile--team${pile.team}` : ''} ${pile.layers === 0 ? 'pile--empty' : ''}`}
      data-anchor={`pile-${pile.sideId}`}
      data-layers={pile.layers}
      style={{ '--pile-layers': Math.max(1, pile.layers) } as CSSProperties}
      role="img"
      aria-label={`${label} (${pile.count})`}
      title={label}
    >
      {Array.from({ length: Math.max(1, pile.layers) }, (_, i) => (
        <span key={i} className="pile__layer" style={{ transform: `translateY(${-i * 2}px)` }} />
      ))}
      {pile.team && <span className="pile__team">T{pile.team}</span>}
    </span>
  );
}
