import type { MatchEvent, MatchTimings, PlayerCount, PlayerId } from '@orlan/game';
import { Room, type RoomClock, RoomError, type RoomPlayer } from './Room';
import { cryptoRng, generatePlayerId, generateRoomCode, generateToken } from '../random';
import type { Rng } from '@orlan/game';

export interface RoomManagerListener {
  onRoomChange(room: Room, events: MatchEvent[]): void;
  onPlayerRemoved(room: Room, playerId: PlayerId, reason: string): void;
  onRoomClosed(room: Room, reason: string): void;
}

export const systemClock: RoomClock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as NodeJS.Timeout),
};

/** Räume ohne verbundene Menschen werden nach dieser Zeit aufgeräumt. */
const IDLE_ROOM_TTL_MS = 30 * 60 * 1000;

/**
 * Verwaltet alle Räume im Speicher.
 * Hinweis: Für mehrere Serverinstanzen / Neustarts später durch einen persistenten Store ersetzen.
 */
export class RoomManager {
  private readonly rooms = new Map<string, Room>();

  constructor(
    private readonly listener: RoomManagerListener,
    private readonly clock: RoomClock = systemClock,
    private readonly rng: Rng = cryptoRng,
  ) {}

  createRoom(options: { hostName: string; playerCount: PlayerCount; isDev?: boolean; timings?: Partial<MatchTimings> }): {
    room: Room;
    host: RoomPlayer;
  } {
    let code = generateRoomCode();
    while (this.rooms.has(code)) code = generateRoomCode();
    const room = new Room(
      {
        clock: this.clock,
        rng: this.rng,
        generatePlayerId,
        generateToken,
        onChange: (r, events) => this.listener.onRoomChange(r, events),
        onPlayerRemoved: (r, id, reason) => this.listener.onPlayerRemoved(r, id, reason),
        onClosed: (r, reason) => {
          this.rooms.delete(r.code);
          this.listener.onRoomClosed(r, reason);
        },
      },
      { code, maxPlayers: options.playerCount, isDev: options.isDev ?? false, timings: options.timings },
    );
    this.rooms.set(code, room);
    const host = room.addPlayer(options.hostName);
    return { room, host };
  }

  get(code: string): Room | undefined {
    return this.rooms.get(normalizeRoomCode(code));
  }

  require(code: string): Room {
    const room = this.get(code);
    if (!room) throw new RoomError('Raum nicht gefunden. Bitte Code prüfen.');
    return room;
  }

  /** Entfernt verlassene Räume. */
  cleanup(): void {
    const now = this.clock.now();
    for (const room of this.rooms.values()) {
      if (!room.hasOnlineHumans() && now - room.lastActivityAt > IDLE_ROOM_TTL_MS) room.close('Raum wegen Inaktivität geschlossen.');
    }
  }

  get size(): number {
    return this.rooms.size;
  }
}

export function normalizeRoomCode(code: string): string {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}
