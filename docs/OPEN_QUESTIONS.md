# Regel-Entscheidungen & offene Punkte

## Verbindlich entschieden (umgesetzt und durch Tests abgesichert)

| Thema | Regel | Tests |
| --- | --- | --- |
| Schneide-Timer | Der Spieler rechts vom Dealer hat **15 s**, um die Schnittstelle zu wählen und zu bestätigen (für alle sichtbar). Danach schneidet das System an einer zufälligen gültigen Stelle. | `rules.test.ts`, `match.test.ts`, `room.test.ts` |
| Zugtimer | Jeder Zug hat **30 s** – für Handkarte und ggf. Kombinationsauswahl zusammen. Ohne bestätigte Karte: zufällige Handkarte; mit bestätigter Karte: beste Kombination. | `rules.test.ts` |
| Kartenbezeichnungen | Sichtbar: Bube = **J**, Dame = **Q**, König = **K** (nur Darstellung, interne Logik unverändert). | `jacks.test.ts`, `texts.test.ts` |
| Buben beim ersten Tisch-Aufdecken | Jeder Bube wird sichtbar aufgedeckt, hervorgehoben (ca. 2,4 s), mit Meldung angezeigt („J♣ wurde aufgedeckt und ans Ende des Decks gelegt. Der Dealer erhält diese Karte am Schluss.“) und sichtbar unter das Deck gelegt; danach Ersatzkarte. Mehrere Buben nacheinander. Die Meldung verschwindet ca. **3 s** nach dem (zuletzt) aufgedeckten Buben automatisch. | `jacks.test.ts`, `texts.test.ts` |
| Letzte Dealer-Karte | „Letzte Karte für [Dealer]: X“ zeigt immer die **tatsächliche** unterste Deckkarte: nach dem Schneiden die Schnittkarte, nach jeder Buben-Verschiebung den zuletzt unter das Deck gelegten Buben. | `jacks.test.ts`, `texts.test.ts` |
| Matchende-Texte | Echte Namen statt Teamnummern. Gewinner: „Nikola gewinnt – herzlichen Glückwunsch!“ bzw. „Nikola und Gabriel haben gewonnen!“. Verlierer: „Nikola gewinnt, du bist so schlecht XD!“ bzw. „Nikola und Gabriel haben gewonnen, ihr seid so schlecht XD!“. | `texts.test.ts` |
| Rundenauswertung | Sichtbar **17 s** (bisher 12 s + 5 s), für alle Clients gleich (Serverphase). | `jacks.test.ts`, `room.test.ts` |
| Tisch zuerst / Spieler zuerst | Nach dem Schneiden hat der Spieler rechts vom Dealer **7 s** (serverseitig, für alle sichtbar). Ohne Wahl entscheidet der Server **rein zufällig** zwischen beiden Optionen (eine Zufallswahl aus 2, unabhängig von den Karten). | `rules.test.ts`, `room.test.ts` |
| Host verlässt den Raum | Nur bewusstes „Raum verlassen“ (mit Sicherheitsabfrage) schließt den Raum für alle; alle anderen werden informiert und landen auf der Startansicht. Disconnect, Hintergrund oder Reload sind **kein** Verlassen – Reconnect funktioniert weiter. | `room.test.ts` |
| Host entfernt Spieler (Lobby) | Spieler wird entfernt, Platz wird frei, Raum bleibt. | `room.test.ts` |
| Host entfernt Spieler (Match) | Match wird abgebrochen, Punkte verworfen, Raum bleibt; alle Verbleibenden kehren in die Lobby zurück, können wieder bereit werden, ein neuer Spieler kann den Platz belegen. | `room.test.ts` |
| Nicht-Host verlässt bewusst (Match) | Sicherheitsabfrage; danach wird das Match sofort abgebrochen, Punkte verworfen, Raum bleibt, alle Verbleibenden kehren in die Lobby zurück, der Platz wird frei, alle müssen erneut „Bereit“ wählen, neues Match startet bei 0. Reload, kurzer Disconnect, App im Hintergrund und Netzwerkunterbrechung lösen das **nicht** aus. | `room.test.ts`, `socket.test.ts` |
| Genau eine Aufnahme | Wird sofort automatisch ausgeführt (Zahlenkarte, Dame, König). Keine Auswahl, kein Liegenlassen. | `rules.test.ts` |
| Mehrere Aufnahmen | Gespielte Karte ist verbindlich; Spieler wählt eine legale Kombination und bestätigt mit „Nehmen“. Gilt nie für den Buben. | `rules.test.ts` |
| Timer während der Auswahl | Der 30-s-Zugtimer läuft weiter. Bei Ablauf bleibt die gespielte Karte; der Server wählt die beste Kombination (♣2/♦10 → Kreuz → Anzahl → Tischreihenfolge). Keine neue Zufallskarte. | `rules.test.ts` |
| Timeout vor „Spielen“ | Rein zufällige Handkarte; danach: nichts / einzige Aufnahme / beste Aufnahme / Buben-Regel. | `rules.test.ts` |
| Bube | Nimmt automatisch alle Zahlenkarten und alle liegenden Buben, nie Damen/Könige; ohne Aufnehmbares bleibt er liegen. Keine manuelle Auswahl. | `rules.test.ts`, `capture.test.ts` |

## Weitere technische Festlegungen (ohne Regeländerung)

- **Gültige Schnittstellen:** jede Position, bei der beide Teilstapel mindestens 1 Karte haben (1–51).
- **Sitzvergabe:** 2/3 Spieler: Host auf Sitz 0, dann Beitrittsreihenfolge. 4 Spieler: Team 1 auf Sitz 0/2, Team 2 auf 1/3.
- **Rundenauswertung:** wird 17 s angezeigt, danach beginnt automatisch die nächste Runde.
- **Nach Matchende:** Der Host bringt alle mit „Zurück zur Lobby“ in die Lobby.

## Noch offen

Keine offenen Regelfragen mehr. Technisch offen:

- Echte Audiodateien statt synthetischer Platzhalter (System ist vorbereitet, siehe docs/ARCHITECTURE.md).
- Persistenz: Räume liegen im Arbeitsspeicher; ein Server-Neustart beendet laufende Räume, nur eine Instanz möglich.
- Deployment / Hosting.

## Technische Risiken

- **Mobile Hintergrund-Tabs** – Browser trennen WebSockets im Hintergrund oft. Reconnect erfolgt automatisch bei Rückkehr.
- **Uhrabweichung** – Timer werden über Server-Deadlines + gemessenen Offset angezeigt; Entscheidungen trifft nur der Server.
