import { type Card, RANK_LABEL, SUIT_SYMBOL, cardLabel, isRedSuit } from '@orlan/game';

/**
 * Kleine Karten-Kennzeichnung für Texte (Aufnahme, Zuganzeige, Auswertung):
 * heller Untergrund, Herz/Karo ROT, Kreuz/Pik SCHWARZ – auch auf dunklem Hintergrund gut lesbar.
 */
export function CardLabel({ card }: { card: Card }) {
  const color = isRedSuit(card.suit) ? 'red' : 'black';
  return (
    <span className={`mini-card mini-card--${color}`} title={cardLabel(card)} aria-label={cardLabel(card)}>
      <span className="mini-card__rank">{RANK_LABEL[card.rank]}</span>
      <span className="mini-card__suit" aria-hidden="true">
        {SUIT_SYMBOL[card.suit]}
      </span>
    </span>
  );
}

/** Mehrere Karten, z. B. "6♣ + 3♦". */
export function CardList({ cards, separator = '+' }: { cards: readonly Card[]; separator?: string }) {
  return (
    <span className="card-list">
      {cards.map((c, i) => (
        <span key={c.id} className="card-list__item">
          {i > 0 && <span className="card-list__sep">{separator}</span>}
          <CardLabel card={c} />
        </span>
      ))}
    </span>
  );
}
