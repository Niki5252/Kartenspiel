# Regel-Entscheidungen & offene Punkte

## Verbindlich entschieden (umgesetzt und durch Tests abgesichert)

| Thema | Regel | Tests |
| --- | --- | --- |
| Tisch zuerst / Spieler zuerst | Nach dem Schneiden hat der Spieler rechts vom Dealer **7 s** (serverseitig, für alle sichtbar). Ohne Wahl entscheidet der Server **rein zufällig** zwischen beiden Optionen (eine Zufallswahl aus 2, unabhängig von den Karten). | `rules.test.ts`, `room.test.ts` |
| Host verlässt den Raum | Nur bewusstes „Raum verlassen“ (mit Sicherheitsabfrage) schließt den Raum für alle; alle anderen werden informiert und landen auf der Startansicht. Disconnect, Hintergrund oder Reload sind **kein** Verlassen – Reconnect funktioniert weiter. | `room.test.ts` |
| Host entfernt Spieler (Lobby) | Spieler wird entfernt, Platz wird frei, Raum bleibt. | `room.test.ts` |
| Host entfernt Spieler (Match) | Match wird abgebrochen, Punkte verworfen, Raum bleibt; alle Verbleibenden kehren in die Lobby zurück, können wieder bereit werden, ein neuer Spieler kann den Platz belegen. | `room.test.ts` |
| Genau eine Aufnahme | Wird sofort automatisch ausgeführt (Zahlenkarte, Dame, König). Keine Auswahl, kein Liegenlassen. | `rules.test.ts` |
| Mehrere Aufnahmen | Gespielte Karte ist verbindlich; Spieler wählt eine legale Kombination und bestätigt mit „Nehmen“. Gilt nie für den Buben. | `rules.test.ts` |
| Timer während der Auswahl | Der 10-s-Zugtimer läuft weiter. Bei Ablauf bleibt die gespielte Karte; der Server wählt die beste Kombination (♣2/♦10 → Kreuz → Anzahl → Tischreihenfolge). Keine neue Zufallskarte. | `rules.test.ts` |
| Timeout vor „Spielen“ | Rein zufällige Handkarte; danach: nichts / einzige Aufnahme / beste Aufnahme / Buben-Regel. | `rules.test.ts` |
| Bube | Nimmt automatisch alle Zahlenkarten und alle liegenden Buben, nie Damen/Könige; ohne Aufnehmbares bleibt er liegen. Keine manuelle Auswahl. | `rules.test.ts`, `capture.test.ts` |

## Weitere technische Festlegungen (ohne Regeländerung)

- **Gültige Schnittstellen:** jede Position, bei der beide Teilstapel mindestens 1 Karte haben (1–51).
- **Nicht-Host verlässt den Raum während eines Matches:** Das Match wird beendet, alle kehren in die Lobby zurück
  (analog zum Entfernen durch den Host).
- **Sitzvergabe:** 2/3 Spieler: Host auf Sitz 0, dann Beitrittsreihenfolge. 4 Spieler: Team 1 auf Sitz 0/2, Team 2 auf 1/3.
- **Rundenauswertung:** wird 12 s angezeigt, danach beginnt automatisch die nächste Runde.
- **Nach Matchende:** Der Host bringt alle mit „Zurück zur Lobby“ in die Lobby.

## Noch offen

- Sound (inkl. AN/STUMM) und ausgearbeitete Animationen – bewusst zurückgestellt.
- Persistenz: Räume liegen im Arbeitsspeicher; ein Server-Neustart beendet laufende Räume, nur eine Instanz möglich.
- Deployment / Hosting.

## Technische Risiken

- **Mobile Hintergrund-Tabs** – Browser trennen WebSockets im Hintergrund oft. Reconnect erfolgt automatisch bei Rückkehr.
- **Uhrabweichung** – Timer werden über Server-Deadlines + gemessenen Offset angezeigt; Entscheidungen trifft nur der Server.
