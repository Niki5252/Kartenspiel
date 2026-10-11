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
export function assignSeats(playerCount: PlayerCount, players: readonly LobbyPlayer[], hostId: PlayerId): PlayerId[] {
  if (players.length !== playerCount) throw new Error('assignSeats: falsche Spielerzahl');
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
