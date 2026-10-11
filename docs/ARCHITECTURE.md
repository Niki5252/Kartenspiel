# Architektur

## Überblick

```
Browser (React)  ──Socket.IO──►  Node-Server (autoritativ)  ──►  @orlan/game (reine Logik)
   Absichten                      validiert, Timer, Zufall          applyAction / advanceTime
   ◄── eigene Sicht (RoomView) ──
```

- **Serverseitig autoritativ:** Der einzige echte Spielzustand liegt im Server (`Room` → `MatchState`).
  Clients senden nur Absichten (`playCard`, `cut`, …). Punkte, Karten und Timer kann kein Client verändern.
- **Geheime Informationen:** Jeder Client bekommt per `projectMatchView` nur seine Sicht: eigene Hand,
  Anzahl fremder Handkarten, Deck-Anzahl (nicht die Reihenfolge). Reconnect-Tokens werden nie an andere gesendet.
- **Sichere Zufälligkeit:** Mischen, automatischer Schnitt und Timeout-Handkarte nutzen `crypto.randomInt`.
  Die Engine bekommt den Zufall als `Rng` injiziert → Tests sind mit Seeds reproduzierbar.

## @orlan/game – Spiellogik

| Modul         | Inhalt                                                                         |
| ------------- | ------------------------------------------------------------------------------ |
| `cards.ts`    | Karten-Typen, IDs (`C2` = Kreuz 2), Tischsortierung (Wert, dann ♣ ♦ ♥ ♠)       |
| `deck.ts`     | Deck, Fisher-Yates-Mischen, Schneiden, Pakete, Buben-Regel beim Tisch-Aufdecken |
| `seating.ts`  | Sitz-Rotation („rechts“ = Sitz + 1), Teams vis-à-vis, Bildschirm-Perspektive   |
| `capture.ts`  | Legale Aufnahmen (Summe 11, Dame/König, Bube), beste Aufnahme bei Timeout      |
| `scoring.ts`  | Rundenwertung (max. 5 Punkte, Gleichstand = keine Punkte), Matchende           |
| `lobby.ts`    | Teamwahl, Bereit-Bedingungen, Sitzvergabe beim Start                            |
| `match.ts`    | Match-Engine als Zustandsautomat                                               |
| `view.ts`     | Gefilterte Spielersicht                                                         |

### Engine-Phasen einer Runde

```
shuffling ─(Zeit)─► cutting ─(Schnitt / 7 s Auto)─► choosingDealOrder ─(Wahl)─► dealing ─(Zeit)─► turn
turn ─(Karte, 0–1 Option)──────────────► moveAnimation ─(Zeit)─► turn (nächster Sitz rechts)
turn ─(Karte, ≥2 Optionen)─► choosingCapture ─(Nehmen / Timeout→beste)─► moveAnimation
turn ─(10 s Timeout: zufällige Handkarte → beste Aufnahme)─► moveAnimation
moveAnimation, alle Hände leer: Deck übrig → dealing (neue 4er-Pakete) · Deck leer → roundSummary
roundSummary ─(Zeit)─► neue Runde (Dealer +1, neu gemischt)   bzw. Match beendet (keine Deadline)
```

- `applyAction(state, action, {now, rng})` – Spieleraktion, liefert neuen Zustand + Ereignisse oder Fehler.
- `advanceTime(state, {now, rng})` – verarbeitet abgelaufene Deadlines (Timer, Animationen).
- Der Zustand ist unveränderlich nach außen (intern `structuredClone`), jede Änderung erhöht `version`.
- Deadlines sind Server-Zeitstempel. Der Client berechnet über `time:sync` den Uhren-Offset → alle sehen denselben Timer.

### Konventionen

- Deck: Index 0 = oberste Karte. Ausgeteilt wird von oben, Pakete à 4, beginnend rechts vom Dealer; der Dealer erhält zuletzt
  (daher bekommt er die beim Schneiden gezeigte Karte und die nach unten geschobenen Buben).
- 4 Spieler: Team 1 = Sitze 0 + 2, Team 2 = Sitze 1 + 3. Bei 2/3 Spielern ist jede Seite ein Sitz (`seat0`, …).

## apps/server

- `rooms/Room.ts` – Lobby, Countdown (3-2-1, Abbruch bei „Nicht bereit“/Verlassen), Host-Rechte, Verbindungsstatus,
  Timer-Planung (ein Timer pro Raum auf die nächste Deadline), Dev-Bots. Unabhängig von Socket.IO (Uhr injiziert, getestet).
- `rooms/RoomManager.ts` – Raumcodes (6 Zeichen ohne verwechselbare Zeichen), Aufräumen inaktiver Räume.
  Räume liegen derzeit **im Speicher**.
- `socket/handlers.ts` – Ereignisse, Eingabevalidierung (`zod`), ein aktiver Socket pro Spieler, Dev-Ereignisse.

### Reconnect

Beim Erstellen/Beitreten erhält der Client `{roomCode, playerId, token}` und speichert sie im `sessionStorage` des Tabs.
Nach Verbindungsabbruch/Reload sendet der Client automatisch `room:resume`. „Verbindung verloren“ wird erst nach 5 s
angezeigt (kurzes App-Wechseln bleibt unsichtbar). Das Match pausiert nie.

## apps/web

- `net/client.ts` – Socket-Verbindung, Zustand (`useSyncExternalStore`), Uhren-Offset, API-Aufrufe.
- `screens/` – Home (Erstellen/Beitreten), Lobby, Spieltisch.
- `components/` – Karte, Timer-Balken, Sitzplatz, Punktestand, Schneiden, Rundenauswertung, Sicherheitsabfrage.
- `dev/` – Dev-Launcher und Split-Screen (nur im Development-Build).
