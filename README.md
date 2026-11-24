# agent-workflow-skills

Drei Skills für Claude Code, die agentisches Arbeiten schneller und sicherer machen. Entstanden aus echten Durchläufen eines verschlüsselten Web-Rätsels, nicht aus Theorie.

*Three Claude Code skills for faster, safer agentic work. Skill text is German; trigger keywords work in English too.*

| Skill | Wofür | Kern |
|---|---|---|
| `oracle-first-exploration` | Langsame oder undurchsichtige Systeme erkunden (UI, API, Rätsel, Config-Labyrinth) | Entscheidungslogik als schnelles Headless-Orakel nachbauen, per BFS durchsuchen, einmal im Echtsystem gegenprüfen. Enthält `explore.mjs` (Node ≥ 18, keine Abhängigkeiten) und fünf Beispiel-Adapter. |
| `goal-signal-check` | Jede mehrstufige Aufgabe | Checkliste: Ziel und Schreibrechte klären, messbares Erfolgssignal festlegen, Köder und Sackgassen erkennen, vor „fertig“ gegenprüfen. |
| `scale-it` | Projekt um Faktor n vergrößern: `/scale-it -10` | Ausgangslage an einer Größenreihe messen, Engpass zuerst, in geprüften Wellen bauen (Fundament → Engpass → Masse → Effizienz), erreichten Faktor mit Beleg melden. Enthält `measure.mjs` für den Vorher-nachher-Vergleich. |

## Installieren

```bash
claude plugin marketplace add paul1064/agent-workflow-skills
```

```bash
claude plugin install agent-workflow-skills@agent-workflow-skills
```

Danach lädt Claude die Skills automatisch, wenn die Aufgabe passt, oder direkt per `/agent-workflow-skills:oracle-first-exploration` bzw. `/agent-workflow-skills:goal-signal-check`. Skalieren: `/agent-workflow-skills:scale-it -10`.

## Explorer ausprobieren

```bash
node skills/oracle-first-exploration/scripts/explore.mjs skills/oracle-first-exploration/examples/toy-adapter.mjs
```

Ausgabe: kürzester Pfad zum Ziel, gefundene Fallen (je einmal, mit Häufigkeit), nie wirksame Kandidaten, Statistik. Exit-Code 0 = Ziel gefunden, 1 = nicht gefunden, 2 = falscher Aufruf, 3 = unvollständig (abgebrochen oder Schritte fehlgeschlagen).

Weitere Beispiele im selben Ordner: `zahlenschloss.mjs`, `labyrinth.mjs`, `api-blaettern.mjs`, `config-schalter.mjs`.

Eigener Adapter: ein ES-Modul mit `initial`, `actions(state)`, `async step(state, action)` und optional `key(state)`. Details im Kopf von `explore.mjs`.

## Gemessen

An einem Web-Rätsel mit verschlüsseltem Tresor (~200 Einträge, PBKDF2) und Zustandsketten:

- Versuch im Browser: ~10 s. Versuch im Headless-Orakel: ~0,1 s, parallel.
- 4⁴-Wegelabyrinth: 0,3 s statt bis zu 256 Handversuchen.
- 9-Schritt-Pfad zum versteckten Endlevel: 1,4 s mit dem generischen Explorer.
- Erkannt: ein Köder (Hinweis führt zu lesbarem Klartext ohne Wirkung) und eine Schleife mit 10¹⁵ Runden ohne Belohnung.

## Abbruch und Wiederaufnahme

```bash
node skills/oracle-first-exploration/scripts/explore.mjs mein-adapter.mjs --checkpoint lauf.ck
```

Mit `--checkpoint` sichert der Explorer seinen Stand regelmäßig und bei jedem Halt; derselbe Aufruf setzt dort fort.

| Störung | Verhalten |
|---|---|
| `step()` wirft (Timeout, 5xx) | Wiederholung mit wachsender Pause, danach als `FEHLER` gemeldet; die Suche läuft weiter, der nächste Lauf holt den Schritt nach |
| System antwortet gar nicht | Halt nach 20 Fehlern in Folge |
| Strg+C, SIGTERM | laufende Schritte enden, Stand gesichert, Exit 3 |
| Speicher fast voll | Halt mit Sicherung statt Absturz; mit mehr Speicher fortsetzen |
| harter Abbruch (SIGKILL, Stromausfall) | die letzte Zwischensicherung gilt |
| Sicherung beschädigt | Prüfsumme schlägt an, die vorige Sicherung (`.bak`) springt ein |

Eine Fortsetzung liefert dieselben Zahlen wie ein Lauf am Stück: kein Schritt doppelt, keiner verloren. Gemessen an 4,9 Mio. Zuständen: Sicherung alle 3 s verlängert den Lauf von 14 s auf 18 s, die Sicherung ist 38 MB groß, Laden dauert 2,7 s.

## Größe

Der Explorer hält pro Zustand nur einen Verweis auf den Vorgänger und verteilt die besuchten Zustände auf mehrere Sets, sobald eines voll ist. Gemessen mit `node tools/bench.mjs 70 220 700 2214 7000` (leeres Gitter, Node 22, 8 GB Heap):

| Zustände | Zeit |
|---|---|
| 4.899 | 0,03 s |
| 48.399 | 0,1 s |
| 489.999 | 1,0 s |
| 4.901.795 | 14 s |
| 48.999.999 | 7 min |

Ab etwa 5 Mio. Zuständen sinkt der Durchsatz (von rund 470.000 auf 116.000 Zustände pro Sekunde): Die Zeit geht in die Suche im Zustands-Set und in die Speicherbereinigung.

## Entwickeln

```bash
node --test tests/*.test.mjs
node tools/check-skills.mjs
node tools/bench.mjs
```

Tests für Explorer, Beispiele, Wiederaufnahme und Hilfsskripte; `check-skills.mjs` meldet, wenn Skills, README und Manifeste nicht zusammenpassen. Alle drei laufen in der CI.

## Grok-Varianten

Zwei der Skills gibt es auch als Grok-Skill. Name, Beschreibung und Anweisungen zum Einfügen in Grok:

- [`grok/oracle-wealth-exploration.md`](grok/oracle-wealth-exploration.md): `oracle-first-exploration`, angepasst für Vermögensaufbau, rein theoretisch.
- [`grok/goal-signal-check.md`](grok/goal-signal-check.md): `goal-signal-check`, angepasst für Grok (Befugnis bei Connect Apps und Automations, Quellen von X).

## Hinweis

Nur auf Systeme anwenden, für die du die Erlaubnis hast: eigene Projekte, CTFs, freigegebene Tests.

## Lizenz

MIT
