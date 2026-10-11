/**
 * Socket.IO-Anbindung: verbindet Sockets mit Spielern, validiert Eingaben, verteilt Sichten.
 */
import type { MatchEvent, PlayerId, TeamNumber } from '@orlan/game';
import type { Ack, ClientToServerEvents, DevTestRoom, ServerToClientEvents, SessionCredentials } from '@orlan/protocol';
import type { Server, Socket } from 'socket.io';
import type { ServerConfig } from '../config';
import { type Room, RoomError } from '../rooms/Room';
import { RoomManager, type RoomManagerListener } from '../rooms/RoomManager';
import { ValidationError, parse, schemas } from './validation';

export interface SocketData {
  roomCode: string | null;
  playerId: PlayerId | null;
}

export type GameServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

/** Automatisch erzeugte Testspieler. Der erste (Host) kann einen echten Namen bekommen. */
const TEST_PLAYER_NAMES = ['P1', 'P2', 'P3', 'P4'];

export function attachGameServer(io: GameServer, config: ServerConfig): RoomManager {
  /** Genau ein aktiver Socket pro Spieler (neuere Verbindung übernimmt). */
  const sockets = new Map<string, GameSocket>();
  const key = (roomCode: string, playerId: PlayerId) => `${roomCode}:${playerId}`;

  const listener: RoomManagerListener = {
    onRoomChange(room: Room, events: MatchEvent[]) {
      for (const p of room.players) {
        const socket = sockets.get(key(room.code, p.id));
        if (!socket) continue;
        socket.emit('room:state', room.viewFor(p.id));
        if (events.length > 0) socket.emit('room:events', events);
      }
    },
    onPlayerRemoved(room: Room, playerId: PlayerId, reason: string) {
      const socket = sockets.get(key(room.code, playerId));
      sockets.delete(key(room.code, playerId));
      if (socket) {
        socket.data.roomCode = null;
        socket.data.playerId = null;
        socket.emit('room:closed', { reason });
      }
    },
    onRoomClosed(room: Room, reason: string) {
      for (const p of room.players) {
        const socket = sockets.get(key(room.code, p.id));
        sockets.delete(key(room.code, p.id));
        if (socket) {
          socket.data.roomCode = null;
          socket.data.playerId = null;
          socket.emit('room:closed', { reason });
        }
      }
    },
  };

  const manager = new RoomManager(listener);
  setInterval(() => manager.cleanup(), 60_000).unref();

  io.on('connection', (socket) => {
    socket.data.roomCode = null;
    socket.data.playerId = null;

    const bind = (room: Room, playerId: PlayerId) => {
      unbind();
      const k = key(room.code, playerId);
      const previous = sockets.get(k);
      if (previous && previous.id !== socket.id) {
        previous.data.roomCode = null;
        previous.data.playerId = null;
        previous.emit('session:replaced');
      }
      sockets.set(k, socket);
      socket.data.roomCode = room.code;
      socket.data.playerId = playerId;
      room.markOnline(playerId);
    };

    const unbind = () => {
      const { roomCode, playerId } = socket.data;
      if (!roomCode || !playerId) return;
      const k = key(roomCode, playerId);
      if (sockets.get(k)?.id === socket.id) {
        sockets.delete(k);
        manager.get(roomCode)?.markOffline(playerId);
      }
      socket.data.roomCode = null;
      socket.data.playerId = null;
    };

    const current = (): { room: Room; playerId: PlayerId } => {
      const { roomCode, playerId } = socket.data;
      const room = roomCode ? manager.get(roomCode) : undefined;
      if (!room || !playerId || !room.getPlayer(playerId)) throw new RoomError('Du bist in keinem Raum.');
      return { room, playerId };
    };

    const requireDev = () => {
      if (!config.devMode) throw new RoomError('Development Mode ist deaktiviert.');
    };

    socket.on('time:sync', (ack) => {
      if (typeof ack === 'function') ack(Date.now());
    });

    handle(socket, 'room:create', (payload): SessionCredentials => {
      const { name, playerCount } = parse(schemas.create, payload);
      const { room, host } = manager.createRoom({ hostName: name, playerCount });
      bind(room, host.id);
      return { roomCode: room.code, playerId: host.id, token: host.token };
    });

    handle(socket, 'room:join', (payload): SessionCredentials => {
      const { code, name } = parse(schemas.join, payload);
      const room = manager.require(code);
      const player = room.addPlayer(name);
      bind(room, player.id);
      return { roomCode: room.code, playerId: player.id, token: player.token };
    });

    handle(socket, 'room:resume', (payload) => {
      const creds = parse(schemas.resume, payload);
      const room = manager.require(creds.roomCode);
      const player = room.authenticate(creds.playerId, creds.token);
      if (!player) throw new RoomError('Sitzung ungültig oder abgelaufen.');
      bind(room, player.id);
      return undefined;
    });

    handleNoPayload(socket, 'room:leave', () => {
      const { room, playerId } = current();
      unbind();
      room.leave(playerId);
      return undefined;
    });

    handle(socket, 'lobby:setTeam', (payload) => {
      const { team } = parse(schemas.setTeam, payload);
      const { room, playerId } = current();
      room.setTeam(playerId, team as TeamNumber);
      return undefined;
    });

    handle(socket, 'lobby:setReady', (payload) => {
      const { ready } = parse(schemas.setReady, payload);
      const { room, playerId } = current();
      room.setReady(playerId, ready);
      return undefined;
    });

    handle(socket, 'host:kick', (payload) => {
      const { playerId: target } = parse(schemas.kick, payload);
      const { room, playerId } = current();
      room.kick(playerId, target);
      return undefined;
    });

    handleNoPayload(socket, 'host:abortMatch', () => {
      const { room, playerId } = current();
      room.abortMatch(playerId);
      return undefined;
    });

    handleNoPayload(socket, 'host:returnToLobby', () => {
      const { room, playerId } = current();
      room.returnToLobby(playerId);
      return undefined;
    });

    handle(socket, 'game:action', (payload) => {
      const action = parse(schemas.gameAction, payload);
      const { room, playerId } = current();
      room.gameAction(playerId, action);
      return undefined;
    });

    // ---------------------------------------------------------------- Dev Mode
    handle(socket, 'dev:createTestRoom', (payload): DevTestRoom => {
      requireDev();
      const { playerCount, botCount, autoReady, hostName } = parse(schemas.devCreate, payload);
      if (botCount >= playerCount) throw new RoomError('Mindestens ein Testspieler muss menschlich sein.');
      const { room, host } = manager.createRoom({ hostName: hostName ?? TEST_PLAYER_NAMES[0]!, playerCount, isDev: true });
      const players = [host];
      for (let i = 1; i < playerCount; i++) {
        players.push(room.addPlayer(TEST_PLAYER_NAMES[i]!, { isBot: i >= playerCount - botCount }));
      }
      players.forEach((p, i) => {
        // Team 1: P1 + P3, Team 2: P2 + P4 (sitzen dadurch vis-à-vis)
        if (playerCount === 4) room.setTeam(p.id, i % 2 === 0 ? 1 : 2);
      });
      players.forEach((p) => {
        if (p.isBot || autoReady) room.setReady(p.id, true);
      });
      return {
        roomCode: room.code,
        players: players.map((p) => ({ name: p.name, playerId: p.id, token: p.token, isBot: p.isBot })),
      };
    });

    handle(socket, 'dev:setBot', (payload) => {
      requireDev();
      const { playerId, isBot } = parse(schemas.devSetBot, payload);
      const { room } = current();
      room.setBot(playerId, isBot);
      return undefined;
    });

    socket.on('disconnect', () => unbind());
  });

  return manager;
}

type PayloadEvent = {
  [K in keyof ClientToServerEvents]: Parameters<ClientToServerEvents[K]> extends [unknown, Ack<infer _T>] ? K : never;
}[keyof ClientToServerEvents];

type NoPayloadEvent = 'room:leave' | 'host:abortMatch' | 'host:returnToLobby';

type AckData<K extends keyof ClientToServerEvents> =
  Parameters<ClientToServerEvents[K]> extends [...unknown[], Ack<infer T>] ? T : never;

/** Einheitliche Fehlerbehandlung: Raum-/Validierungsfehler gehen als Ack an den Client zurück. */
function handle<K extends PayloadEvent>(socket: GameSocket, event: K, fn: (payload: unknown) => AckData<K>): void {
  (socket.on as (e: string, l: (payload: unknown, ack: unknown) => void) => void)(event, (payload, ack) => {
    respond(ack, () => fn(payload));
  });
}

function handleNoPayload<K extends NoPayloadEvent>(socket: GameSocket, event: K, fn: () => AckData<K>): void {
  (socket.on as (e: string, l: (ack: unknown) => void) => void)(event, (ack) => {
    respond(ack, fn);
  });
}

function respond(ack: unknown, fn: () => unknown): void {
  const reply = typeof ack === 'function' ? (ack as (r: unknown) => void) : () => {};
  try {
    reply({ ok: true, data: fn() });
  } catch (err) {
    if (err instanceof RoomError || err instanceof ValidationError) {
      reply({ ok: false, error: err.message });
    } else {
      console.error(err);
      reply({ ok: false, error: 'Interner Serverfehler.' });
    }
  }
}
