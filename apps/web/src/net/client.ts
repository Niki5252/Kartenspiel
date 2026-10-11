/**
 * Verbindung zum Server und clientseitiger Zustand (reine Anzeige – keine Spielentscheidungen).
 */
import type { MatchEvent } from '@orlan/game';
import type { Ack, ClientGameAction, ClientToServerEvents, RoomView, ServerToClientEvents, SessionCredentials } from '@orlan/protocol';
import { type Socket, io } from 'socket.io-client';
import { clearSession, loadSession, saveSession } from './session';

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

export interface ClientState {
  connection: ConnectionStatus;
  view: RoomView | null;
  /** Grund, warum man aus dem Raum geflogen ist / der Raum geschlossen wurde. */
  exitReason: string | null;
  /** Zuletzt empfangene Ereignisse (für Sounds/Animationen). */
  lastEvents: { events: MatchEvent[]; seq: number };
  resuming: boolean;
}

type Listener = () => void;

const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io({
  autoConnect: true,
  transports: ['websocket', 'polling'],
  reconnectionDelay: 500,
  reconnectionDelayMax: 3000,
});

let state: ClientState = {
  connection: 'connecting',
  view: null,
  exitReason: null,
  lastEvents: { events: [], seq: 0 },
  resuming: loadSession() !== null,
};
const listeners = new Set<Listener>();
let clockOffset = 0;

function setState(patch: Partial<ClientState>): void {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getState(): ClientState {
  return state;
}

/** Geschätzte aktuelle Serverzeit – alle Timer werden damit berechnet (für alle synchron). */
export function serverNow(): number {
  return Date.now() + clockOffset;
}

function syncClock(): void {
  const sentAt = Date.now();
  socket.emit('time:sync', (server) => {
    const receivedAt = Date.now();
    clockOffset = server + (receivedAt - sentAt) / 2 - receivedAt;
  });
}

socket.on('connect', () => {
  setState({ connection: 'connected' });
  syncClock();
  const creds = loadSession();
  if (creds) {
    setState({ resuming: true });
    socket.emit('room:resume', creds, (res) => {
      if (!res.ok) {
        clearSession();
        setState({ view: null, exitReason: state.view ? res.error : null });
      }
      setState({ resuming: false });
    });
  }
});

socket.on('disconnect', () => setState({ connection: 'disconnected' }));
socket.io.on('reconnect_attempt', () => setState({ connection: 'connecting' }));

socket.on('room:state', (view) => setState({ view, exitReason: null }));
socket.on('room:events', (events) => setState({ lastEvents: { events, seq: state.lastEvents.seq + 1 } }));
socket.on('room:closed', ({ reason }) => {
  clearSession();
  setState({ view: null, exitReason: reason });
});
socket.on('session:replaced', () => {
  setState({ view: null, exitReason: 'Dieser Spieler wurde in einem anderen Tab/Fenster geöffnet.' });
});

setInterval(() => {
  if (socket.connected) syncClock();
}, 30_000);

// Smartphone: nach Rückkehr aus dem Hintergrund sofort wieder verbinden.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !socket.connected) socket.connect();
});

// ---------------------------------------------------------------------------
// Aktionen
// ---------------------------------------------------------------------------

type AckResult<T> = { ok: true; data: T } | { ok: false; error: string };

function request<T>(emit: (ack: Ack<T>) => void): Promise<AckResult<T>> {
  return new Promise((resolve) => {
    if (!socket.connected) {
      resolve({ ok: false, error: 'Keine Verbindung zum Server.' });
      return;
    }
    emit((res) => resolve(res));
  });
}

function storeCredentials(res: AckResult<SessionCredentials>): AckResult<SessionCredentials> {
  if (res.ok) {
    saveSession(res.data);
    setState({ exitReason: null });
  }
  return res;
}

export const api = {
  createRoom: (name: string, playerCount: 2 | 3 | 4) =>
    request<SessionCredentials>((ack) => socket.emit('room:create', { name, playerCount }, ack)).then(storeCredentials),
  joinRoom: (code: string, name: string) =>
    request<SessionCredentials>((ack) => socket.emit('room:join', { code, name }, ack)).then(storeCredentials),
  resumeWith: (creds: SessionCredentials) => {
    saveSession(creds);
    return request<undefined>((ack) => socket.emit('room:resume', creds, ack));
  },
  leaveRoom: async () => {
    const res = await request<undefined>((ack) => socket.emit('room:leave', ack));
    clearSession();
    setState({ view: null });
    return res;
  },
  setTeam: (team: 1 | 2) => request<undefined>((ack) => socket.emit('lobby:setTeam', { team }, ack)),
  setReady: (ready: boolean) => request<undefined>((ack) => socket.emit('lobby:setReady', { ready }, ack)),
  kick: (playerId: string) => request<undefined>((ack) => socket.emit('host:kick', { playerId }, ack)),
  abortMatch: () => request<undefined>((ack) => socket.emit('host:abortMatch', ack)),
  returnToLobby: () => request<undefined>((ack) => socket.emit('host:returnToLobby', ack)),
  gameAction: (action: ClientGameAction) => request<undefined>((ack) => socket.emit('game:action', action, ack)),
  dismissExit: () => setState({ exitReason: null }),
};

/** Nur im Development Mode verwendet. */
export const devApi = {
  createTestRoom: (playerCount: 2 | 3 | 4, botCount: number, autoReady: boolean, hostName?: string) =>
    request<import('@orlan/protocol').DevTestRoom>((ack) =>
      socket.emit('dev:createTestRoom', { playerCount, botCount, autoReady, ...(hostName ? { hostName } : {}) }, ack),
    ),
  setBot: (playerId: string, isBot: boolean) => request<undefined>((ack) => socket.emit('dev:setBot', { playerId, isBot }, ack)),
};
