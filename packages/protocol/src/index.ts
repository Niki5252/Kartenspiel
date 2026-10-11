/**
 * Nachrichten zwischen Browser und Server (Socket.IO).
 * Der Client sendet nur Absichten; der Server validiert alles und schickt jedem Spieler seine eigene Sicht.
 */
import type { CardId, DealOrder, MatchEvent, MatchView, PlayerCount, PlayerId, SeatIndex, TeamNumber } from '@orlan/game';

export const ROOM_CODE_LENGTH = 6;
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const PLAYER_NAME_MAX_LENGTH = 20;

export type RoomStatus = 'lobby' | 'countdown' | 'playing' | 'finished';

export interface PlayerPublic {
  id: PlayerId;
  name: string;
  team: TeamNumber | null;
  ready: boolean;
  /** false = "Verbindung verloren" (erst nach einer kurzen Toleranzzeit). */
  connected: boolean;
  isHost: boolean;
  isBot: boolean;
  seat: SeatIndex | null;
}

export interface RoomView {
  code: string;
  maxPlayers: PlayerCount;
  status: RoomStatus;
  hostId: PlayerId;
  myPlayerId: PlayerId;
  players: PlayerPublic[];
  /** Sitz -> Spieler, sobald ein Match läuft. */
  seats: PlayerId[] | null;
  countdownEndsAt: number | null;
  startBlockers: string[];
  match: MatchView | null;
  isDevRoom: boolean;
  /** Serverzeit beim Versand – Clients berechnen daraus den Uhren-Offset. */
  serverNow: number;
  notice: string | null;
}

/** Zugangsdaten für Wiederverbindung. Werden pro Browser-Tab gespeichert. */
export interface SessionCredentials {
  roomCode: string;
  playerId: PlayerId;
  token: string;
}

export type Ack<T = undefined> = (response: { ok: true; data: T } | { ok: false; error: string }) => void;

/** Spielaktionen aus Sicht des Clients – der Sitz wird serverseitig ergänzt. */
export type ClientGameAction =
  | { type: 'cut'; index: number }
  | { type: 'chooseDealOrder'; order: DealOrder }
  | { type: 'playCard'; cardId: CardId }
  | { type: 'chooseCapture'; cardIds: CardId[] };

export interface DevTestPlayer {
  name: string;
  playerId: PlayerId;
  token: string;
  isBot: boolean;
}

export interface DevTestRoom {
  roomCode: string;
  players: DevTestPlayer[];
}

export interface ClientToServerEvents {
  'room:create': (payload: { name: string; playerCount: PlayerCount }, ack: Ack<SessionCredentials>) => void;
  'room:join': (payload: { code: string; name: string }, ack: Ack<SessionCredentials>) => void;
  'room:resume': (payload: SessionCredentials, ack: Ack) => void;
  'room:leave': (ack: Ack) => void;
  'lobby:setTeam': (payload: { team: TeamNumber }, ack: Ack) => void;
  'lobby:setReady': (payload: { ready: boolean }, ack: Ack) => void;
  'host:kick': (payload: { playerId: PlayerId }, ack: Ack) => void;
  'host:abortMatch': (ack: Ack) => void;
  'host:returnToLobby': (ack: Ack) => void;
  'game:action': (action: ClientGameAction, ack: Ack) => void;
  'time:sync': (ack: (serverNow: number) => void) => void;
  // Nur im Development Mode verfügbar (Server lehnt sonst ab).
  'dev:createTestRoom': (payload: { playerCount: PlayerCount; botCount: number; autoReady: boolean }, ack: Ack<DevTestRoom>) => void;
  'dev:setBot': (payload: { playerId: PlayerId; isBot: boolean }, ack: Ack) => void;
}

export interface ServerToClientEvents {
  'room:state': (view: RoomView) => void;
  'room:events': (events: MatchEvent[]) => void;
  'room:closed': (payload: { reason: string }) => void;
  'session:replaced': () => void;
}
