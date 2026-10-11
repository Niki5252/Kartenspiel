/**
 * Misch- und Schnitt-Animation in der Tischmitte (CSS, synchronisiert über negativen animation-delay).
 */
import type { Card } from '@orlan/game';
import type { CSSProperties } from 'react';
import { CardBack, PlayingCard } from '../components/PlayingCard';
import { useMountElapsed } from './phaseClock';
import { cutTimeline } from './timeline';

/** Zwei Hälften werden auseinandergezogen und verzahnt wieder zusammengeschoben (2 Durchgänge). */
export function ShuffleAnimation({ phaseStartedAt, durationMs }: { phaseStartedAt: number; durationMs: number }) {
  const t0 = useMountElapsed(phaseStartedAt);
  const style = { '--t0': `${-t0}ms`, '--dur': `${durationMs}ms` } as CSSProperties;
  return (
    <div className="shuffle" style={style} data-anchor="deck" aria-label="Karten werden gemischt">
      {Array.from({ length: 8 }, (_, i) => (
        <CardBack key={i} size="md" className={`shuffle__card shuffle__card--${i % 2 === 0 ? 'l' : 'r'}`} style={{ '--i': i } as CSSProperties} />
      ))}
    </div>
  );
}

interface CutProps {
  phaseStartedAt: number;
  durationMs: number;
  cutIndex: number;
  deckCount: number;
  revealedCard: Card;
}

/** Oberer Stapel wird angehoben, seine unterste Karte gezeigt, dann unter den unteren Stapel gelegt. */
export function CutAnimation({ phaseStartedAt, durationMs, cutIndex, deckCount, revealedCard }: CutProps) {
  const t0 = useMountElapsed(phaseStartedAt);
  const t = cutTimeline(durationMs);
  const style = {
    '--t0': `${-t0}ms`,
    '--dur': `${durationMs}ms`,
    '--lift-end': `${t.liftEnd}ms`,
    '--reveal-at': `${t.revealAt}ms`,
    '--tuck-start': `${t.tuckStart}ms`,
  } as CSSProperties;
  return (
    <div className="cut-anim" style={style} data-anchor="deck" aria-label={`Abgehoben bei ${cutIndex} Karten`}>
      <div className="cut-anim__bottom">
        <CardBack size="md" />
        <span className="cut-anim__count">{deckCount - cutIndex}</span>
      </div>
      <div className="cut-anim__top">
        <CardBack size="md" />
        <span className="cut-anim__count">{cutIndex}</span>
        <div className="cut-anim__reveal">
          <PlayingCard card={revealedCard} size="md" />
        </div>
      </div>
    </div>
  );
}
