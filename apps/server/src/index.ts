import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sirv from 'sirv';
import { Server } from 'socket.io';
import { loadConfig } from './config';
import { type GameServer, attachGameServer } from './socket/handlers';

const config = loadConfig();

// Optional: gebautes Frontend direkt mit ausliefern (ein Prozess für Produktion).
const here = dirname(fileURLToPath(import.meta.url));
const staticDir = config.staticDir ?? resolve(here, '../../web/dist');
const serveStatic = existsSync(staticDir) ? sirv(staticDir, { single: true, gzip: true }) : null;

const httpServer = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  if (serveStatic) {
    serveStatic(req, res, () => {
      res.writeHead(404);
      res.end('Not found');
    });
    return;
  }
  res.writeHead(404);
  res.end('Orlan Online Server – Frontend nicht gebaut.');
});

const io: GameServer = new Server(httpServer, {
  cors: config.corsOrigins.length > 0 ? { origin: config.corsOrigins } : undefined,
  // Kurze Ping-Intervalle erkennen echte Verbindungsabbrüche zügig.
  pingInterval: 10_000,
  pingTimeout: 8_000,
});

attachGameServer(io, config);

httpServer.listen(config.port, () => {
  console.log(`Orlan Online Server läuft auf http://localhost:${config.port}`);
  if (config.devMode) console.log('⚠ Development/Test Mode ist AKTIV');
  if (serveStatic) console.log(`Frontend wird aus ${staticDir} ausgeliefert`);
});
