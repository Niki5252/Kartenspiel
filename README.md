# Orlan Online

Browserbasiertes Multiplayer-Kartenspiel für 2, 3 oder 4 Spieler (4 = zwei Teams).
Ohne Installation, ohne Konto – Spielername + Raumcode genügen.

## Schnellstart

Voraussetzung: Node.js ≥ 20 (empfohlen 22, siehe `.nvmrc`).

```bash
npm install
npm run dev
```

- Spiel: <http://localhost:5173>
- Development/Test Mode: <http://localhost:5173/dev>
- Server (Socket.IO): `http://localhost:3001` (wird vom Vite-Dev-Server automatisch angesprochen)

Im lokalen Netzwerk (z. B. echtes Smartphone) die von Vite angezeigte `Network:`-Adresse öffnen.

## Befehle

| Befehl              | Zweck                                                           |
| ------------------- | --------------------------------------------------------------- |
| `npm run dev`       | Server (mit Dev-Mode) + Frontend mit Hot Reload                 |
| `npm test`          | Automatisierte Tests (Spiellogik + Server-Räume)                |
| `npm run typecheck` | TypeScript-Prüfung aller Pakete                                 |
| `npm run build`     | Produktions-Build (Frontend + Server-Bundle)                    |
| `npm start`         | Produktionsserver – liefert auch das gebaute Frontend aus       |

## Development / Test Mode

Aktiv nur, wenn **beides** zutrifft:

1. Server läuft mit `ORLAN_DEV_MODE=true` (macht `npm run dev` automatisch).
2. Frontend ist ein Development-Build (`vite`). Im Produktions-Build ist der Dev-Code komplett entfernt.

Möglichkeiten:

- **`/dev` → Testraum erstellen**: 2/3/4 Testspieler, wahlweise mit automatischen Bots und „Alle sofort bereit“.
  - **Split-Screen**: alle menschlichen Testspieler nebeneinander in einem Fenster.
  - **„In neuem Tab öffnen“**: jeder Testspieler in einem eigenen Tab/Fenster.
- **Mehrere Tabs manuell**: Jeder Browser-Tab ist automatisch ein eigener Spieler (Sitzung im `sessionStorage`).
  Tab 1 erstellt den Raum, Tab 2–4 treten mit dem Code bei.
- **Bot umschalten**: In der Lobby eines Dev-Raums kann jeder Testspieler auf „Bot spielt automatisch“ gestellt werden.
- **Disconnect/Reconnect testen**: Tab neu laden (Wiederverbindung) oder Tab schließen und den Link erneut öffnen;
  nach 5 s ohne Verbindung erscheint „Verbindung verloren“. Der Timer läuft weiter, die Timeout-Automatik spielt.
- **UI-Vorschau ohne Server**: `/dev/ui?scenario=myturn|capture|otherturn|mycut` zeigt den echten Spieltisch mit festen
  Testsituationen (z. B. Kombinationsauswahl mit 9♥ und 9♣) – nur im Development-Build.
- **Timeout testen**: einfach nichts tun – nach 30 s spielt das System eine zufällige Handkarte (Schneiden: automatisch nach 15 s).

## Projektstruktur

```
packages/game       Reine Spiellogik (Regeln, Engine, Sicht-Projektion) + Tests – kein I/O
packages/protocol   Nachrichten-Typen zwischen Client und Server
apps/server         Autoritativer Node/Socket.IO-Server (Räume, Timer, Zufall, Reconnect, Dev-Mode)
apps/web            React/Vite-Frontend (nur Darstellung + Eingaben)
docs/               Architektur und offene Punkte
```

Details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · Offene Regel-/Technikfragen: [docs/OPEN_QUESTIONS.md](docs/OPEN_QUESTIONS.md)

## Produktion (Kurzfassung)

```bash
npm ci && npm run build
PORT=8080 npm start          # ORLAN_DEV_MODE NICHT setzen
```

Ein einzelner Node-Prozess liefert Frontend und WebSocket aus. Geeignet z. B. für Fly.io, Render oder Railway
(dauerhafte WebSocket-Verbindungen nötig – klassisches Serverless/Vercel passt dafür nicht).
