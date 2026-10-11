/**
 * Sitzordnung, Teams und Perspektive.
 *
 * Konvention: Sitzplätze sind 0..n-1. "Nach rechts" bedeutet immer Sitz + 1 (modulo n).
 * Zugreihenfolge, Austeilen und Dealerwechsel laufen alle in diese Richtung.
 * Die interne Reihenfolge ist für alle Clients gleich; jeder Client dreht nur die Darstellung,
 * sodass er sich selbst unten sieht.
 */

export type PlayerCount = 2 | 3 | 4;
export type SeatIndex = number;

export const PLAYER_COUNTS: readonly PlayerCount[] = [2, 3, 4];

export function isPlayerCount(value: unknown): value is PlayerCount {
  return value === 2 || value === 3 || value === 4;
}

/** Sitz direkt rechts von `seat`. */
export function seatToRight(seat: SeatIndex, playerCount: PlayerCount): SeatIndex {
  return (seat + 1) % playerCount;
}

/** Dealer wandert nach jeder vollständigen Runde genau einen Sitz nach rechts. */
export function nextDealerSeat(dealer: SeatIndex, playerCount: PlayerCount): SeatIndex {
  return seatToRight(dealer, playerCount);
}

/** Der Spieler rechts vom Dealer schneidet, wählt die Austeilreihenfolge und spielt zuerst. */
export function firstPlayerSeat(dealer: SeatIndex, playerCount: PlayerCount): SeatIndex {
  return seatToRight(dealer, playerCount);
}

/** Austeilreihenfolge einer Runde: beginnend rechts vom Dealer, der Dealer erhält zuletzt. */
export function dealingOrder(dealer: SeatIndex, playerCount: PlayerCount): SeatIndex[] {
  const order: SeatIndex[] = [];
  let seat = dealer;
  for (let i = 0; i < playerCount; i++) {
    seat = seatToRight(seat, playerCount);
    order.push(seat);
  }
  return order;
}

// ---------------------------------------------------------------------------
// Seiten (Wertungseinheiten): bei 4 Spielern Teams, sonst jeder Spieler für sich.
// ---------------------------------------------------------------------------

export type TeamNumber = 1 | 2;
export type SideId = string;

export interface Side {
  id: SideId;
  seats: SeatIndex[];
  /** Nur bei 4 Spielern gesetzt. */
  team: TeamNumber | null;
}

export function teamSideId(team: TeamNumber): SideId {
  return `team${team}`;
}

export function seatSideId(seat: SeatIndex): SideId {
  return `seat${seat}`;
}

/**
 * Bei 4 Spielern sitzen Teamkollegen vis-à-vis: Team 1 = Sitze 0 und 2, Team 2 = Sitze 1 und 3.
 */
export function teamOfSeat(seat: SeatIndex): TeamNumber {
  return seat % 2 === 0 ? 1 : 2;
}

export function buildSides(playerCount: PlayerCount): Side[] {
  if (playerCount === 4) {
    return [
      { id: teamSideId(1), seats: [0, 2], team: 1 },
      { id: teamSideId(2), seats: [1, 3], team: 2 },
    ];
  }
  return Array.from({ length: playerCount }, (_, seat) => ({ id: seatSideId(seat), seats: [seat], team: null }));
}

export function sideIdOfSeat(seat: SeatIndex, playerCount: PlayerCount): SideId {
  return playerCount === 4 ? teamSideId(teamOfSeat(seat)) : seatSideId(seat);
}

// ---------------------------------------------------------------------------
// Perspektive
// ---------------------------------------------------------------------------

export type ScreenPosition = 'bottom' | 'top' | 'left' | 'right' | 'topLeft' | 'topRight';

/** Abstand nach rechts vom eigenen Sitz aus (0 = ich selbst). */
export function relativeOffset(viewerSeat: SeatIndex, seat: SeatIndex, playerCount: PlayerCount): number {
  return (seat - viewerSeat + playerCount) % playerCount;
}

/**
 * Bildschirmposition eines Sitzes aus Sicht von `viewerSeat`.
 * - 2 Spieler: ich unten, Gegner oben
 * - 3 Spieler: ich unten, rechter Nachbar oben rechts, linker Nachbar oben links
 * - 4 Spieler: ich unten, rechter Gegner rechts, Teamkollege oben, linker Gegner links
 */
export function screenPositionOf(viewerSeat: SeatIndex, seat: SeatIndex, playerCount: PlayerCount): ScreenPosition {
  const offset = relativeOffset(viewerSeat, seat, playerCount);
  if (offset === 0) return 'bottom';
  if (playerCount === 2) return 'top';
  if (playerCount === 3) return offset === 1 ? 'topRight' : 'topLeft';
  if (offset === 1) return 'right';
  if (offset === 2) return 'top';
  return 'left';
}
