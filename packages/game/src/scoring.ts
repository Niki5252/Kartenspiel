import { type Card, isClubTwo, isDiamondTen } from './cards';
import type { SideId } from './seating';

export const MATCH_TARGET_SCORE = 11;

export const POINTS = {
  mostCards: 2,
  mostClubs: 1,
  clubTwo: 1,
  diamondTen: 1,
} as const;

export interface SideRoundStats {
  sideId: SideId;
  cardCount: number;
  clubCount: number;
  hasClubTwo: boolean;
  hasDiamondTen: boolean;
  points: number;
}

export interface RoundScore {
  stats: SideRoundStats[];
  /** Eindeutiger Gewinner der Kartenmehrheit, sonst null (Gleichstand auf Platz 1 -> keine Punkte). */
  mostCardsSide: SideId | null;
  mostClubsSide: SideId | null;
  clubTwoSide: SideId | null;
  diamondTenSide: SideId | null;
}

/** Eindeutiger Spitzenreiter oder null bei Gleichstand auf Platz 1. */
export function uniqueLeader(values: ReadonlyArray<{ id: SideId; value: number }>): SideId | null {
  if (values.length === 0) return null;
  const max = Math.max(...values.map((v) => v.value));
  const leaders = values.filter((v) => v.value === max);
  return leaders.length === 1 ? (leaders[0] as { id: SideId }).id : null;
}

/**
 * Rundenwertung (max. 5 Punkte, kein Bonus fürs Abräumen):
 * meiste Karten 2, meiste Kreuz 1, Kreuz 2 1, Karo 10 1.
 */
export function scoreRound(sideIds: readonly SideId[], captured: Readonly<Record<SideId, readonly Card[]>>): RoundScore {
  const base = sideIds.map((sideId) => {
    const cards = captured[sideId] ?? [];
    return {
      sideId,
      cardCount: cards.length,
      clubCount: cards.filter((c) => c.suit === 'clubs').length,
      hasClubTwo: cards.some(isClubTwo),
      hasDiamondTen: cards.some(isDiamondTen),
    };
  });

  const mostCardsSide = uniqueLeader(base.map((s) => ({ id: s.sideId, value: s.cardCount })));
  const mostClubsSide = uniqueLeader(base.map((s) => ({ id: s.sideId, value: s.clubCount })));
  const clubTwoSide = base.find((s) => s.hasClubTwo)?.sideId ?? null;
  const diamondTenSide = base.find((s) => s.hasDiamondTen)?.sideId ?? null;

  const stats: SideRoundStats[] = base.map((s) => ({
    ...s,
    points:
      (s.sideId === mostCardsSide ? POINTS.mostCards : 0) +
      (s.sideId === mostClubsSide ? POINTS.mostClubs : 0) +
      (s.hasClubTwo ? POINTS.clubTwo : 0) +
      (s.hasDiamondTen ? POINTS.diamondTen : 0),
  }));

  return { stats, mostCardsSide, mostClubsSide, clubTwoSide, diamondTenSide };
}

/**
 * Matchende – wird nur nach vollständig abgeschlossener Runde geprüft.
 * Gewinner ist, wer mindestens das Ziel erreicht UND allein die höchste Punktzahl hat.
 * Gilt einheitlich für 2 Spieler, 3 Spieler und 2 Teams.
 */
export function determineMatchWinner(
  scores: Readonly<Record<SideId, number>>,
  target: number = MATCH_TARGET_SCORE,
): SideId | null {
  const entries = Object.entries(scores).map(([id, value]) => ({ id, value }));
  const leader = uniqueLeader(entries);
  if (leader === null) return null;
  return (scores[leader] ?? 0) >= target ? leader : null;
}
