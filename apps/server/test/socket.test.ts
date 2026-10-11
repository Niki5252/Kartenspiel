/**
 * Integrationstest über echte Socket.IO-Verbindungen:
 * Reload/Disconnect vs. bewusstes Verlassen.
 */
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { ClientToServerEvents, RoomView, ServerToClientEvents, SessionCredentials } from '@orlan/protocol';
import { Server } from 'socket.io';
import { type Socket, io as connect } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config';
import { type GameServer, attachGameServer } from '../src/socket/handlers';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

let url = '';
let ioServer: GameServer;
const clients: Client[] = [];

beforeAll(async () => {
  const http = createServer();
  ioServer = new Server(http);
  attachGameServer(ioServer, { ...loadConfig({}), devMode: false });
  await new Promise<void>((resolve) => http.listen(0, resolve));
  url = `http://localhost:${(http.address() as AddressInfo).port}`;
});

afterAll(async () => {
  for (const c of clients) c.close();
  await ioServer.close();
});

function client(): Promise<Client & { latest: () => RoomView | null; closedReason: () => string | null }> {
  const socket = connect(url, { transports: ['websocket'], forceNew: true }) as Client;
  clients.push(socket);
  let latest: RoomView | null = null;
  let closed: string | null = null;
  socket.on('room:state', (v) => (latest = v));
  socket.on('room:closed', ({ reason }) => (closed = reason));
  return new Promise((resolve) =>
    socket.on('connect', () => resolve(Object.assign(socket, { latest: () => latest, closedReason: () => closed }))),
  );
}

function ack<T>(fn: (cb: (r: { ok: true; data: T } | { ok: false; error: string }) => void) => void): Promise<T> {
  return new Promise((resolve, reject) => fn((r) => (r.ok ? resolve(r.data) : reject(new Error(r.error)))));
}

async function until(check: () => boolean, timeoutMs = 6000): Promise<void> {
  const end = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > end) throw new Error('Timeout beim Warten');
    await new Promise((r) => setTimeout(r, 20));
  }
}

describe('Socket: Reload/Disconnect vs. bewusstes Verlassen', () => {
  it('Reload eines Nicht-Hosts erhält das Match; bewusstes Verlassen bricht es ab, Raum bleibt', async () => {
    const host = await client();
    const creds = await ack<SessionCredentials>((cb) => host.emit('room:create', { name: 'Host', playerCount: 2 }, cb));
    let guest = await client();
    const guestCreds = await ack<SessionCredentials>((cb) => guest.emit('room:join', { code: creds.roomCode, name: 'Gast' }, cb));
    await ack((cb) => host.emit('lobby:setReady', { ready: true }, cb));
    await ack((cb) => guest.emit('lobby:setReady', { ready: true }, cb));
    await until(() => host.latest()?.status === 'playing');

    // Browser-Reload: Verbindung weg, neuer Socket meldet sich mit gespeicherten Zugangsdaten an
    guest.close();
    await new Promise((r) => setTimeout(r, 100));
    expect(host.latest()?.status).toBe('playing');
    guest = await client();
    await ack((cb) => guest.emit('room:resume', guestCreds, cb));
    await until(() => guest.latest()?.match !== null && guest.latest()?.match !== undefined);
    expect(guest.latest()?.status).toBe('playing');
    expect(guest.latest()?.match?.mySeat).not.toBeNull();
    expect(host.latest()?.status).toBe('playing');

    // Bewusstes Verlassen
    await ack((cb) => guest.emit('room:leave', cb));
    await until(() => host.latest()?.status === 'lobby');
    const view = host.latest()!;
    expect(view.match).toBeNull();
    expect(view.players.map((p) => p.name)).toEqual(['Host']);
    expect(view.notice).toContain('Gast hat den Raum verlassen');
    expect(host.closedReason()).toBeNull();

    // Neuer Spieler kann den Platz belegen
    const newcomer = await client();
    await ack((cb) => newcomer.emit('room:join', { code: creds.roomCode, name: 'Neu' }, cb));
    await until(() => host.latest()?.players.length === 2);
    // alte Zugangsdaten des Ausgetretenen sind ungültig
    const old = await client();
    await expect(ack((cb) => old.emit('room:resume', guestCreds, cb))).rejects.toThrow();
  }, 15_000);

  it('Host verlässt bewusst: Raum wird geschlossen, andere werden informiert', async () => {
    const host = await client();
    const creds = await ack<SessionCredentials>((cb) => host.emit('room:create', { name: 'Host', playerCount: 2 }, cb));
    const guest = await client();
    await ack((cb) => guest.emit('room:join', { code: creds.roomCode, name: 'Gast' }, cb));
    // kurzer Disconnect des Hosts schließt nichts
    host.disconnect();
    await new Promise((r) => setTimeout(r, 100));
    expect(guest.closedReason()).toBeNull();
    host.connect();
    await until(() => host.connected);
    await ack((cb) => host.emit('room:resume', creds, cb));
    // bewusstes Verlassen
    await ack((cb) => host.emit('room:leave', cb));
    await until(() => guest.closedReason() !== null);
    expect(guest.closedReason()).toContain('geschlossen');
    const late = await client();
    await expect(ack((cb) => late.emit('room:join', { code: creds.roomCode, name: 'Spät' }, cb))).rejects.toThrow('nicht gefunden');
  }, 15_000);
});
