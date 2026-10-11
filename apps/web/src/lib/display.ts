import { type Card, type PlayerCount, type ScreenPosition, RANK_LABEL_DE, SUIT_SYMBOL, type SideId, cardLabel, screenPositionOf, teamOfSeat } from '@orlan/game';
import type { PlayerPublic, RoomView } from '@orlan/protocol';

export function playerAtSeat(view: RoomView, seat: number): PlayerPublic | undefined {
  const id = view.seats?.[seat];
  return id ? view.players.find((p) => p.id === id) : undefined;
}

/**
 * Verbindungshinweis neben dem Namen – null, wenn verbunden.
 * "Verbindung verloren" nur, wenn der Spieler schon einmal verbunden war.
 */
export function connectionLabel(player: Pick<PlayerPublic, 'connected' | 'everConnected'> | undefined): string | null {
  if (!player || player.connected) return null;
  return player.everConnected ? 'Verbindung verloren' : 'Noch nicht verbunden';
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

// ---------------------------------------------------------------------------
// Sitzplätze & Rollen (reine Funktionen – getestet in lib/display.test.ts)
// ---------------------------------------------------------------------------

/** Rollen sind Kennzeichnungen neben dem Namen – niemals Ersatz für den Namen. */
export type SeatRole = 'dealer' | 'host';

export interface SeatDisplay {
  seat: number;
  position: ScreenPosition;
  /** Immer der vom Spieler gewählte Name. */
  name: string;
  isMe: boolean;
  roles: SeatRole[];
  team: number | null;
  connected: boolean;
  connectionLabel: string | null;
}

/** Alle Sitze aus Sicht des eigenen Clients (eigener Sitz immer unten). */
export function seatDisplays(view: RoomView): SeatDisplay[] {
  const match = view.match;
  if (!match) return [];
  const n = match.playerCount;
  const viewerSeat = match.mySeat ?? 0;
  return Array.from({ length: n }, (_, seat) => {
    const player = playerAtSeat(view, seat);
    const roles: SeatRole[] = [];
    if (match.round.dealerSeat === seat) roles.push('dealer');
    if (player && player.id === view.hostId) roles.push('host');
    return {
      seat,
      position: screenPositionOf(viewerSeat, seat, n),
      name: player?.name ?? `Sitz ${seat + 1}`,
      isMe: seat === match.mySeat,
      roles,
      team: n === 4 ? teamOfSeat(seat) : null,
      connected: player?.connected ?? false,
      connectionLabel: connectionLabel(player),
    };
  });
}

/** Beschriftung der beim Schneiden gezeigten Karte – bezieht sich immer auf den AKTUELLEN Dealer. */
export function lastCardLabel(view: RoomView): string {
  const match = view.match;
  if (!match) return 'Letzte Karte für den Dealer';
  const dealerSeat = match.round.dealerSeat;
  if (dealerSeat === match.mySeat) return 'Letzte Karte für dich (Dealer)';
  const dealer = playerAtSeat(view, dealerSeat);
  return dealer ? `Letzte Karte für ${dealer.name}` : 'Letzte Karte für den Dealer';
}

/** "Tisch ist leer" nur in echten Spielphasen anzeigen, nicht beim Mischen/Schneiden/Wählen. */
export function showEmptyTableHint(view: RoomView): boolean {
  const round = view.match?.round;
  if (!round || round.table.length > 0 || round.dealsDone === 0) return false;
  return round.phase === 'turn' || round.phase === 'choosingCapture' || round.phase === 'moveAnimation' || round.phase === 'dealing';
}
