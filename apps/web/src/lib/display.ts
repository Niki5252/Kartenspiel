import { type Card, type PlayerCount, RANK_LABEL_DE, SUIT_SYMBOL, type SideId, cardLabel } from '@orlan/game';
import type { PlayerPublic, RoomView } from '@orlan/protocol';

export function playerAtSeat(view: RoomView, seat: number): PlayerPublic | undefined {
  const id = view.seats?.[seat];
  return id ? view.players.find((p) => p.id === id) : undefined;
}

export function me(view: RoomView): PlayerPublic | undefined {
  return view.players.find((p) => p.id === view.myPlayerId);
}

/** Anzeigename einer Wertungsseite: "Team 1" bzw. Spielername. */
export function sideLabel(view: RoomView, sideId: SideId): string {
  const side = view.match?.sides.find((s) => s.id === sideId);
  if (!side) return sideId;
  if (side.team !== null) return `Team ${side.team}`;
  return playerAtSeat(view, side.seats[0] ?? -1)?.name ?? sideId;
}

export function shortCard(card: Card): string {
  return `${RANK_LABEL_DE[card.rank]}${SUIT_SYMBOL[card.suit]}`;
}

export function describeCards(cards: readonly Card[]): string {
  return cards.map(shortCard).join(' + ');
}

export { cardLabel };

export function playerCountLabel(n: PlayerCount): string {
  return n === 4 ? '4 Spieler (2 Teams)' : `${n} Spieler`;
}
