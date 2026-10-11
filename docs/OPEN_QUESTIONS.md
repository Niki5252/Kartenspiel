# Offene Punkte & getroffene Annahmen

Die Spielregeln wurden nicht verändert. An folgenden Stellen lassen die Regeln etwas offen; die aktuelle
technische Umsetzung ist jeweils beschrieben und kann leicht angepasst werden.

## Regel-Lücken (bitte bestätigen)

1. **Zeitlimit für „Tisch zuerst / Spieler zuerst“** – Die Regeln nennen keines. Aktuell: kein Timer.
   Ist der Spieler offline, kann nur der Host das Match abbrechen. Vorschlag: ebenfalls Zeitlimit + Zufallswahl?
2. **Aufnahme-Auswahl nach „Spielen“** – Bei mehreren Optionen ist die Karte mit „Spielen“ verbindlich gespielt; der
   10-s-Zugtimer läuft während der Auswahl weiter. Läuft er ab, wählt das System die beste Aufnahme (Prioritäten aus Regel 25).
3. **Aufnahme ist Pflicht** – Wenn eine legale Aufnahme existiert, wird aufgenommen (genau eine → automatisch,
   mehrere → Auswahl). Eine Option „nichts nehmen“ gibt es nicht.
4. **Gültige Schnittstellen** – Jede Position, bei der beide Teilstapel mindestens 1 Karte haben (1–51).
5. **Host verlässt den Raum** – Da der Ersteller immer Host ist, wird der Raum dann für alle geschlossen.
6. **Spieler verlässt/wird entfernt während eines Matches** – Das Match wird beendet, alle kehren in die Lobby zurück.
7. **Sitzvergabe** – 2/3 Spieler: Host auf Sitz 0, dann Beitrittsreihenfolge. 4 Spieler: Team 1 auf Sitz 0/2, Team 2 auf 1/3.
8. **Anzeigedauer der Rundenauswertung** – 12 s, danach automatisch nächste Runde.
9. **Nach Matchende** – Der Host bringt alle mit „Zurück zur Lobby“ in die Lobby; dort neues Bereit-Melden.

## Technische Risiken

- **Zustand nur im Arbeitsspeicher** – Server-Neustart beendet laufende Räume; nur eine Serverinstanz möglich.
  Der `RoomManager` ist die einzige Stelle, die später durch einen persistenten Store (z. B. Redis) ersetzt wird.
- **Mobile Hintergrund-Tabs** – Browser trennen WebSockets im Hintergrund oft. Reconnect erfolgt automatisch bei Rückkehr.
- **Uhrabweichung** – Timer werden über Server-Deadlines + gemessenen Offset angezeigt; Entscheidungen trifft nur der Server.
