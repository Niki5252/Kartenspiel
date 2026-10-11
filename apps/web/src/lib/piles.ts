/**
 * Gesammelte Kartenhaufen – rein, testbar.
 * Kein Zahlenwert auf dem Haufen; die Dicke wächst mit der Anzahl (nur visuelles Feedback).
 */
import { type SeatIndex, type SideId, type TeamNumber } from '@orlan/game';
import type { RoomView } from '@orlan/protocol';

export const MAX_PILE_LAYERS = 12;

/** 0 Karten -> kein Haufen; danach wächst er stufenweise (je 4 Karten eine Lage), maximal 12 Lagen. */
export function pileLayers(count: number): number {
  if (count <= 0) return 0;
  return Math.min(MAX_PILE_LAYERS, Math.ceil(count / 4));
}

/**
 * Bei 4 Spielern liegt jeder Team-Haufen beim ersten Sitz seines Teams:
 * Team 1 -> Sitz 1, Team 2 -> Sitz 2 (intern 0 / 1). So ist jeder Haufen bei einem eigenen Teammitglied.
 */
export const TEAM_PILE_SEAT: Record<TeamNumber, SeatIndex> = { 1: 0, 2: 1 };

export interface PileDisplay {
  sideId: SideId;
  seat: SeatIndex;
  team: TeamNumber | null;
  count: number;
  layers: number;
}

/** 2 Spieler -> 2 Haufen, 3 Spieler -> 3 Haufen, 4 Spieler -> 2 Team-Haufen. */
export function capturedPiles(view: RoomView): PileDisplay[] {
  const match = view.match;
  if (!match) return [];
  return match.sides.map((side) => {
    const count = match.round.capturedCounts[side.id] ?? 0;
    return {
      sideId: side.id,
      seat: side.team !== null ? TEAM_PILE_SEAT[side.team] : (side.seats[0] ?? 0),
      team: side.team,
      count,
      layers: pileLayers(count),
    };
  });
}

export function pileAtSeat(piles: readonly PileDisplay[], seat: SeatIndex): PileDisplay | null {
  return piles.find((p) => p.seat === seat) ?? null;
}
