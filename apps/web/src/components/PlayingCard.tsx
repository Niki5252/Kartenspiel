import { type Card, RANK_LABEL, SUIT_SYMBOL, cardLabel, isRedSuit } from '@orlan/game';
import type { CSSProperties } from 'react';

interface Props {
  card: Card;
  selected?: boolean;
  highlighted?: boolean;
  dimmed?: boolean;
  size?: 'sm' | 'md' | 'lg';
  onClick?: () => void;
  className?: string;
  style?: CSSProperties;
  /** Ziel-/Startpunkt für Flug-Animationen. */
  anchor?: string;
}

/** Klassische französische Karte: Herz/Karo rot, Kreuz/Pik schwarz. */
export function PlayingCard({ card, selected, highlighted, dimmed, size = 'md', onClick, className = '', style, anchor }: Props) {
  const classes = [
    'card',
    `card--${size}`,
    isRedSuit(card.suit) ? 'card--red' : 'card--black',
    selected ? 'card--selected' : '',
    highlighted ? 'card--highlighted' : '',
    dimmed ? 'card--dimmed' : '',
    onClick ? 'card--clickable' : '',
    className,
  ].join(' ');
  const rank = RANK_LABEL[card.rank];
  const suit = SUIT_SYMBOL[card.suit];
  const content = (
    <>
      <span className="card__corner">
        <span className="card__rank">{rank}</span>
        <span className="card__suit">{suit}</span>
      </span>
      <span className="card__center">{suit}</span>
      <span className="card__corner card__corner--bottom">
        <span className="card__rank">{rank}</span>
        <span className="card__suit">{suit}</span>
      </span>
    </>
  );
  if (onClick) {
    return (
      <button type="button" className={classes} style={style} data-anchor={anchor} onClick={onClick} aria-label={cardLabel(card)} aria-pressed={selected}>
        {content}
      </button>
    );
  }
  return (
    <div className={classes} style={style} data-anchor={anchor} role="img" aria-label={cardLabel(card)}>
      {content}
    </div>
  );
}

export function CardBack({ size = 'sm', className = '', style }: { size?: 'xs' | 'sm' | 'md'; className?: string; style?: CSSProperties }) {
  return <div className={`card card--${size} card--back ${className}`} style={style} aria-hidden="true" />;
}
