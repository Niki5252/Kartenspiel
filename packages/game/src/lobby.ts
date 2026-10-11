/**
 * Reine Lobby-Regeln: Teamwahl, Bereit-System, Sitzvergabe beim Matchstart.
 */
import { type PlayerCount, type SeatIndex, type TeamNumber, teamOfSeat } from './seating';

export type PlayerId = string;

export const MAX_TEAM_SIZE = 2;
export const COUNTDOWN_SECONDS = 3;

export interface LobbyPlayer {
  id: PlayerId;
  team: TeamNumber | null;
  ready: boolean;
}

export function requiresTeams(playerCount: PlayerCount): boolean {
  return playerCount === 4;
}

export function teamMemberCount(players: readonly LobbyPlayer[], team: TeamNumber): number {
  return players.filter((p) => p.team === team).length;
}

/** Ein Spieler darf einem Team beitreten, wenn dort (ohne ihn selbst) noch Platz ist. */
export function canJoinTeam(players: readonly LobbyPlayer[], playerId: PlayerId, team: TeamNumber): boolean {
  return players.filter((p) => p.team === team && p.id !== playerId).length < MAX_TEAM_SIZE;
}

/** Bei 4 Spielern muss zuerst ein Team gewählt werden, bevor man sich bereit meldet. */
export function canSetReady(playerCount: PlayerCount, player: LobbyPlayer): boolean {
  return !requiresTeams(playerCount) || player.team !== null;
}

/** Gründe, warum der Countdown (noch) nicht starten kann. Leere Liste = Countdown startet. */
export function startBlockers(playerCount: PlayerCount, players: readonly LobbyPlayer[]): string[] {
  const blockers: string[] = [];
  if (players.length < playerCount) blockers.push(`Warte auf Spieler (${players.length}/${playerCount})`);
  if (requiresTeams(playerCount)) {
    if (teamMemberCount(players, 1) !== MAX_TEAM_SIZE || teamMemberCount(players, 2) !== MAX_TEAM_SIZE) {
      blockers.push('Beide Teams brauchen genau zwei Spieler');
    }
  }
  if (players.some((p) => !p.ready)) blockers.push('Nicht alle Spieler sind bereit');
  return blockers;
}

/**
 * Sitzvergabe beim Matchstart (Index = Sitz, Wert = Spieler).
 * - 2/3 Spieler: Host auf Sitz 0, danach in Beitrittsreihenfolge.
 * - 4 Spieler: Team 1 auf Sitze 0 und 2, Team 2 auf Sitze 1 und 3 (Teamkollegen vis-à-vis);
 *   innerhalb eines Teams sitzt der Host bzw. der zuerst Beigetretene auf dem kleineren Sitz.
 * `players` muss in Beitrittsreihenfolge übergeben werden.
 */
export function assignSeats(
  playerCount: PlayerCount,
  players: readonly LobbyPlayer[],
  hostId: PlayerId,
  preferred?: readonly (PlayerId | null)[] | null,
): PlayerId[] {
  if (players.length !== playerCount) throw new Error('assignSeats: falsche Spielerzahl');
  // Testmodus: gezielte Belegung, sofern vollständig und gültig (Teamkollegen vis-à-vis).
  if (preferred && isValidSeatPlan(playerCount, players, preferred)) return preferred.map((id) => id as PlayerId);
  const ordered = [...players].sort((a, b) => Number(b.id === hostId) - Number(a.id === hostId));

  if (!requiresTeams(playerCount)) return ordered.map((p) => p.id);

  const seats: PlayerId[] = new Array(playerCount);
  for (const team of [1, 2] as const) {
    const members = ordered.filter((p) => p.team === team);
    const teamSeats = [0, 1, 2, 3].filter((s) => teamOfSeat(s) === team);
    if (members.length !== MAX_TEAM_SIZE) throw new Error('assignSeats: Teams unvollständig');
    members.forEach((m, i) => {
      seats[teamSeats[i] as SeatIndex] = m.id;
    });
  }
  return seats;
}

// ---------------------------------------------------------------------------
// Gezielte Sitzbelegung (Testmodus, 4 Spieler)
// ---------------------------------------------------------------------------

/**
 * Ein Sitzplan ist gültig, wenn jeder Sitz genau einen Spieler hat, kein Spieler doppelt sitzt
 * und jeder Spieler im Team seines Sitzes ist (Team 1 = Sitze 0+2, Team 2 = Sitze 1+3 -> vis-à-vis).
 */
export function isValidSeatPlan(playerCount: PlayerCount, players: readonly LobbyPlayer[], plan: readonly (PlayerId | null)[]): boolean {
  if (plan.length !== playerCount || plan.some((id) => id === null)) return false;
  const ids = new Set(plan);
  if (ids.size !== playerCount) return false;
  return plan.every((id, seat) => {
    const p = players.find((x) => x.id === id);
    if (!p) return false;
    return !requiresTeams(playerCount) || p.team === teamOfSeat(seat);
  });
}

export interface SeatPlanResult {
  plan: (PlayerId | null)[];
  /** Neue Teamzuordnung aller betroffenen Spieler (Team ergibt sich aus dem Sitz). */
  teams: Record<PlayerId, TeamNumber | null>;
}

/**
 * Setzt `playerId` auf `seat`. Ist der Sitz belegt, tauschen beide Spieler die Plätze.
 * Das Team folgt immer dem Sitz, dadurch sind ungültige Kombinationen ausgeschlossen.
 * Spieler ohne Sitz, deren Team dadurch überfüllt wäre, verlieren ihre Teamzuordnung.
 */
export function placePlayerOnSeat(
  playerCount: PlayerCount,
  players: readonly LobbyPlayer[],
  plan: readonly (PlayerId | null)[] | null,
  playerId: PlayerId,
  seat: SeatIndex,
): SeatPlanResult {
  if (!requiresTeams(playerCount)) throw new Error('Sitzwahl nur bei 4 Spielern');
  if (!Number.isInteger(seat) || seat < 0 || seat >= playerCount) throw new Error('Ungültiger Sitz');
  if (!players.some((p) => p.id === playerId)) throw new Error('Spieler nicht gefunden');
  const next: (PlayerId | null)[] = plan && plan.length === playerCount ? [...plan] : new Array(playerCount).fill(null);
  const from = next.indexOf(playerId);
  const occupant = next[seat] ?? null;
  next[seat] = playerId;
  if (from >= 0 && from !== seat) next[from] = occupant; // Tausch
  else if (occupant && occupant !== playerId) {
    // Verdrängter Spieler ohne bisherigen Sitz: bekommt einen freien Sitz seines bisherigen Teams oder keinen.
    const free = next.findIndex((id, s) => id === null && s !== seat);
    if (free >= 0) next[free] = occupant;
  }
  const teams: Record<PlayerId, TeamNumber | null> = {};
  for (const p of players) {
    const s = next.indexOf(p.id);
    teams[p.id] = s >= 0 ? teamOfSeat(s) : p.team;
  }
  // Teamgröße für Spieler ohne Sitz begrenzen
  for (const team of [1, 2] as const) {
    const seated = next.filter((id, s) => id !== null && teamOfSeat(s) === team).length;
    let room = MAX_TEAM_SIZE - seated;
    for (const p of players) {
      if (next.includes(p.id) || teams[p.id] !== team) continue;
      if (room > 0) room--;
      else teams[p.id] = null;
    }
  }
  return { plan: next, teams };
}
