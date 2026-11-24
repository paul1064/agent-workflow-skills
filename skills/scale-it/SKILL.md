---
name: scale-it
description: Skaliert das aktuelle Projekt um den Faktor n – mehr Umfang, mehr Tragfähigkeit, messbar effizienter. Aufruf `/scale-it -n`, z. B. `/scale-it -10` für Faktor 10. Misst zuerst die Ausgangslage an einer Größenreihe, findet den Engpass, der bei n bricht, baut in geprüften Wellen und meldet den tatsächlich erreichten Faktor mit Beleg. Nutzen, wenn ein Projekt deutlich größer, leistungsfähiger oder umfangreicher werden soll. Triggers: scale-it, scale it, skalieren, hochskalieren, 10x, größer machen, ausbauen, scale up, make it bigger.
argument-hint: "-n [fokus] [go]   (z. B. -10 = Faktor 10; ohne Zahl: 2; go = ohne Zwischenstopp bauen)"
---

# Scale-It

Macht aus einem Projekt ein n-mal größeres – ohne dass es n-mal schwerer zu warten wird.

**Leitsatz:** Skaliert wird die *Wirkung* (Umfang, Last, Tempo). Komplexität ist der Preis dafür, nicht das Ziel: jede neue Abstraktion muss einen Faktor tragen, sonst fliegt sie raus.

## 0. Argument lesen

- `-10`, `10`, `x10`, `10x` → `n = 10`. Keine Zahl → `n = 2`. `n < 2` → einmal nachfragen, nichts tun.
- **Fokus** (optional): ein Wort nach der Zahl beschränkt auf eine Achse, z. B. `/scale-it -10 tragfähigkeit`.
- **`go`** (optional): nach dem Plan ohne Zwischenstopp bauen. Gilt nur für Umkehrbares auf einem eigenen Branch und nie gegen Projektregeln, die eine Freigabe verlangen.
- `n > 5` läuft in Stufen von höchstens ×3. Nach jeder Stufe wird neu gemessen; der Engpass der nächsten Stufe ist oft ein anderer.

## 1. Ausgangslage messen (nur lesen)

Ohne Zahl kein Faktor. Vier Schritte, in dieser Reihenfolge:

1. **Projektregeln lesen** (`CLAUDE.md`, README, Contributing). Sie gelten vor diesem Skill: verlangt das Projekt Freigaben, Stories oder Design-Dokumente, läuft Scale-It durch diesen Prozess.
2. **Umgebung prüfen.** Welche Mess- und Testbefehle laufen *hier* wirklich (Compiler, Engine, Laufzeit, externe Dienste)? Jeden einmal ausführen. Was hier nicht läuft, ist „hier nicht messbar“ – diese Teile landen später in einer eigenen Liste „auf dem Zielrechner“, nicht stillschweigend im Plan.
3. **Bestand zählen** und speichern, außerhalb des Projekts:
   ```bash
   node "${CLAUDE_SKILL_DIR}/scripts/measure.mjs" . --json > <scratch>/vorher.json
   ```
   Das liefert Dateien, Code- und Testzeilen, größte Datei, CI. Fachliche Größen kommen aus dem Projekt dazu:

   | Achse | Messgröße (Beispiele) |
   |---|---|
   | **Umfang** | Features, Endpunkte, Screens, Level, Inhalte, Befehle, Formate |
   | **Tragfähigkeit** | Datensätze, gleichzeitige Nutzer/Objekte, Dateigröße, Durchsatz bis zum Bruch |
   | **Effizienz** | Laufzeit, Speicher, Build-/Testdauer, Kosten pro Vorgang |
   | **Absicherung** | Tests, CI, Typprüfung, Fehlerbehandlung |
   | **Struktur** | Kopplung, größte Datei, doppelte Daten, hart kodierte Werte |

4. **Größenreihe fahren.** Das, was das Projekt verarbeitet, in drei Größen laufen lassen: Ist, ×10, ×100. Wächst die Zeit oder der Speicher deutlich stärker als die Größe, liegt dort der Engpass – gemessen, nicht vermutet. Läuft ×100 sauber durch, die Reihe fortsetzen, bis etwas bricht oder das Zeitbudget endet: die Bruchstelle samt Fehlermeldung *ist* die Tragfähigkeit (harte Grenzen wie Speicher- oder Containerlimits zeigen sich erst dort). Gibt es nichts Lauffähiges, entfällt die Reihe und die Achse heißt „nicht messbar“.

**Gekoppelte Größen:** Hängt eine Größe an einer anderen (10 Karten je Slot → 1000 Kombinationen), ist die *Leitgröße* die, an der jemand von Hand arbeitet. Der Faktor gilt für sie; abgeleitete Größen stehen daneben, zählen aber nicht als Zielerfüllung.

Ergebnis: Tabelle „Achse · Messgröße · Ist-Wert · wie gemessen“. Nie eine geratene Zahl.

## 2. Skalierungsplan

Jede Achse bekommt genau eine Einstufung:

| Einstufung | Bedeutung | Folge |
|---|---|---|
| **trägt** | ×n bringt Nutzen und lässt sich belegen | Ziel = Ist × n |
| **Aufblähen** | ×n ginge nur durch Erfinden oder Kopieren | kein Ziel; steht mit Begründung in der Streichliste |
| **blockiert** | ×n sinnvoll, aber hier nicht bau- oder messbar | Ziel bleibt, Welle wandert auf die Liste „auf dem Zielrechner“ |

Die Streichliste geht dem Faktor vor: lieber ×10 auf zwei Achsen mit Beleg als ×10 auf fünf durch Füllmaterial.

Dann der Plan:

1. **Engpass zuerst.** Was hält bei n-facher Größe nicht? Er kommt vor jedem neuen Feature.
2. **Hebel vor Masse.** n-mal mehr Inhalt entsteht durch Daten, Generatoren und Konfiguration – nicht durch n-mal kopierten Code. Ein Mechanismus, n Ausprägungen.
3. **Eine Quelle.** Was heute doppelt gepflegt wird, läuft bei n auseinander: zusammenführen oder per Prüfskript koppeln.
4. **Absicherung wächst mit.** Jede Welle bringt ihre Tests mit.

Plan als Wellen ausgeben: je Welle Ziel, betroffene Dateien, Erfolgssignal (Befehl + erwarteter Wert), „hier machbar: ja/nein“. Dazu ehrlich: welcher Faktor ist in dieser Sitzung realistisch.

**Stopp: Plan zeigen und Freigabe abwarten** – außer der Aufruf enthielt `go`.

## 3. In Wellen bauen

Reihenfolge fest: **Fundament → Engpass → Masse → Effizienz.**

- **Fundament:** Tests, die den Ist-Zustand festhalten, und ein Benchmark-Befehl für die Größenreihe. Ohne sie ist „schneller“ und „größer“ nicht beweisbar.
- **Engpass:** die Struktur, die n trägt. Vorher/nachher mit demselben Befehl und derselben Eingabe messen.
- **Masse:** Umfang auf dem neuen Fundament ausrollen. Unabhängige Teile parallel an Subagenten geben, jeder mit eigenem Dateibereich und eigenem Erfolgssignal.
- **Effizienz:** Profil ziehen, den größten Brocken optimieren, wieder messen. Nichts optimieren, was das Profil nicht als Brocken zeigt; ist der Brocken dem Verfahren eigen, steht er als „nächster Engpass“ im Bericht statt im Code.

Nach jeder Welle: Tests grün, Messung wiederholt, Zwischenstand in einem Satz. Rote Tests oder ein schlechterer Messwert stoppen die nächste Welle. Tests werden nie abgeschaltet, um weiterzukommen. Findet ein neuer Test einen alten Fehler, wird er behoben und im Bericht genannt.

## 4. Abschlussbericht

```bash
node "${CLAUDE_SKILL_DIR}/scripts/measure.mjs" . --compare <scratch>/vorher.json
```

Tabelle „Achse · vorher · nachher · erreichter Faktor · Ziel n · Beleg“, darunter:

- **Erreicht:** nur Gemessenes. `×4 von ×10` ist ein gültiges Ergebnis; „ungefähr ×10“ ohne Beleg ist keines.
- **Gestrichen:** jede Achse der Einstufung „Aufblähen“, mit Grund.
- **Auf dem Zielrechner:** was blockiert war, als fertige Befehlsliste.
- **Nächster Engpass** und der empfohlene Folgeaufruf.

## Grenzen

- Nichts Unumkehrbares ohne ausdrückliche Freigabe, auch nicht mit `go`: Datenmigrationen, gelöschte Dateien, geänderte öffentliche Schnittstellen, Deployments, Kostenpflichtiges.
- Commits und Pushes nur nach den Regeln des Projekts.
- Zeilen, Dateien und Abhängigkeiten sind keine Erfolgsgröße. Wächst nur der Code und keine fachliche Messgröße, ist die Welle gescheitert.
- Passt zu `goal-signal-check` (Erfolgssignal vor dem Start, Gegenprobe vor „fertig“).
