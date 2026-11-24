# agent-workflow-skills

Zwei Skills für Claude Code, die agentisches Arbeiten schneller und sicherer machen. Entstanden aus echten Durchläufen eines verschlüsselten Web-Rätsels, nicht aus Theorie.

*Two Claude Code skills for faster, safer agentic work. Skill text is German; trigger keywords work in English too.*

| Skill | Wofür | Kern |
|---|---|---|
| `oracle-first-exploration` | Langsame oder undurchsichtige Systeme erkunden (UI, API, Rätsel, Config-Labyrinth) | Entscheidungslogik als schnelles Headless-Orakel nachbauen, per BFS durchsuchen, einmal im Echtsystem gegenprüfen. Enthält `explore.mjs` (Node ≥ 18, keine Abhängigkeiten). |
| `goal-signal-check` | Jede mehrstufige Aufgabe | Checkliste: Ziel und Schreibrechte klären, messbares Erfolgssignal festlegen, Köder und Sackgassen erkennen, vor „fertig“ gegenprüfen. |

## Installieren

```bash
claude plugin marketplace add paul1064/agent-workflow-skills
```

```bash
claude plugin install agent-workflow-skills@agent-workflow-skills
```

Danach lädt Claude die Skills automatisch, wenn die Aufgabe passt, oder direkt per `/agent-workflow-skills:oracle-first-exploration` bzw. `/agent-workflow-skills:goal-signal-check`.

## Explorer ausprobieren

```bash
node skills/oracle-first-exploration/scripts/explore.mjs skills/oracle-first-exploration/examples/toy-adapter.mjs
```

Ausgabe: kürzester Pfad zum Ziel, gefundene Fallen (je einmal, mit Häufigkeit), nie wirksame Kandidaten, Statistik. Exit-Code 0 = Ziel gefunden, 1 = nicht gefunden, 2 = falscher Aufruf.

Eigener Adapter: ein ES-Modul mit `initial`, `actions(state)`, `async step(state, action)` und optional `key(state)`. Details im Kopf von `explore.mjs`.

## Gemessen

An einem Web-Rätsel mit verschlüsseltem Tresor (~200 Einträge, PBKDF2) und Zustandsketten:

- Versuch im Browser: ~10 s. Versuch im Headless-Orakel: ~0,1 s, parallel.
- 4⁴-Wegelabyrinth: 0,3 s statt bis zu 256 Handversuchen.
- 9-Schritt-Pfad zum versteckten Endlevel: 1,4 s mit dem generischen Explorer.
- Erkannt: ein Köder (Hinweis führt zu lesbarem Klartext ohne Wirkung) und eine Schleife mit 10¹⁵ Runden ohne Belohnung.

## Hinweis

Nur auf Systeme anwenden, für die du die Erlaubnis hast: eigene Projekte, CTFs, freigegebene Tests.

## Lizenz

MIT
