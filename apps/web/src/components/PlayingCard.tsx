import { type Card, RANK_LABEL_DE, SUIT_SYMBOL, cardLabel, isRedSuit } from '@orlan/game';

interface Props {
  card: Card;
  selected?: boolean;
  highlighted?: boolean;
  dimmed?: boolean;
  size?: 'sm' | 'md' | 'lg';
  onClick?: () => void;
  className?: string;
}

/** Klassische französische Karte: Herz/Karo rot, Kreuz/Pik schwarz. */
export function PlayingCard({ card, selected, highlighted, dimmed, size = 'md', onClick, className = '' }: Props) {
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
  const rank = RANK_LABEL_DE[card.rank];
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
      <button type="button" className={classes} onClick={onClick} aria-label={cardLabel(card)} aria-pressed={selected}>
        {content}
      </button>
    );
  }
  return (
    <div className={classes} role="img" aria-label={cardLabel(card)}>
      {content}
    </div>
  );
}

export function CardBack({ size = 'sm', className = '' }: { size?: 'xs' | 'sm' | 'md'; className?: string }) {
  return <div className={`card card--${size} card--back ${className}`} aria-hidden="true" />;
}
