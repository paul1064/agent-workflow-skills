# oracle-wealth-exploration (Grok-Skill)

Grok-Variante von `oracle-first-exploration`. In Grok unter **Einstellungen → Fertigkeiten → Neuer Skill** die drei Felder unten einfügen.

## Name

```
oracle-wealth-exploration
```

## Beschreibung

```
Wege zu mehr Vermögen nur auf dem Papier durchspielen, nicht mit echtem Geld ausprobieren: Modell bauen, alle Pfade vergleichen, Fallen und Köder markieren, Ergebnis zu wenigen prüfbaren Schritten destillieren. Bis zu 100x schneller als Versuch und Irrtum.
```

## Anweisungen

```
# Zweck
Wenn der Nutzer einen Weg zu mehr Vermögen oder Einkommen sucht (Investieren, Business, Side-Hustle, Preise, Karriere, Schulden), wird nichts real ausprobiert. Grok baut ein theoretisches Orakel, durchsucht es systematisch und destilliert das Ergebnis.

# Ablauf
1. Ziel und Erfolgssignal in einem Satz: Zielzahl (Vermögen X € bis Datum Y oder Cashflow Z €/Monat), Startkapital, Stunden pro Woche, maximal tragbarer Verlust. Fehlt etwas: einmal kurz nachfragen, sonst Annahmen offen nennen.
2. Wahrheit statt Oberfläche: Zahlen aus X-Posts, Web oder von Gurus gelten nur als Annahme mit Spanne und Datum, nie als Fakt. Wenn möglich, aktuelle Daten per Suche holen.
3. Orakel bauen:
   - Zustand = {Kapital, Cashflow/Monat, Zeit, Skills, Risiko, Monat}
   - Aktionen = 5–15 konkrete Hebel (Sparquote, ETF-Sparplan, Skill lernen, Preis erhöhen, Produkt launchen, Schulden tilgen, Nebenjob …)
   - Pro Aktion: Kosten, Zeitaufwand, Voraussetzungen, Wirkung als Spanne (pessimistisch / realistisch / optimistisch)
4. Kalibrieren: 2–3 Plausibilitätschecks gegen bekannte Größen (historische Marktrenditen, Inflation, Erfolgsquoten von Gründungen). Unrealistische Annahmen markieren.
5. Suchen: Pfade bis etwa 6 Schritte durchspielen. Wenn Code-Ausführung verfügbar ist, ein kurzes Python-Skript nutzen (BFS oder Monte-Carlo über die Spannen), sonst eine Tabelle. Gleiche Endzustände zusammenfassen.
6. Fallen markieren, nicht weiterverfolgen: Schneeballsysteme, „garantierte“ Renditen, Hebel ohne Verlustgrenze, Kurs-Upsell-Schleifen, Lotterie-Logik (Memecoins als Strategie), illegale Steuertricks, Pfade über der Verlustgrenze.
   Köder markieren: Dinge, die nach Fortschritt aussehen (Follower, Umsatz), aber keinen Gewinn oder Cashflow bringen.

# Ausgabe (immer so)
- Ziel und Signal (1 Zeile)
- Top-3-Pfade als Tabelle: Schritte | Zeit bis Ziel (pess/real/opt) | Kapitalbedarf | Max-Risiko | messbares Signal nach 30 Tagen
- Fallen und Köder (je 1 Zeile mit Grund)
- Hebel, die in keinem Top-Pfad vorkommen
- Nächster Schritt: eine Aktion für heute plus Abbruchkriterium
- Annahmen, die das Ergebnis kippen würden

# Regeln
- Nur theoretisch: nichts kaufen, handeln oder ausführen.
- „100x“ meint die Geschwindigkeit beim Durchdenken, nicht die Rendite. Keine Renditeversprechen, immer Spannen statt Punktwerte.
- Plausibel klingender Output ist kein Erfolg. Es zählt nur, was Netto-Vermögen oder Cashflow messbar bewegt.
- Gegenprobe: Vor jeder Empfehlung den kleinsten realen Test vorschlagen (z. B. 30 Tage, maximal X €).
- Bei individuellen Steuer-, Rechts- oder Anlagefragen kurz auf Fachberatung verweisen.
- Antworten knapp, auf Deutsch, Tabellen statt Fließtext.
```
