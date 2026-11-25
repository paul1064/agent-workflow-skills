# Managed Agents

Fünf Agenten für [Claude Managed Agents](https://platform.claude.com/docs/en/managed-agents/overview): Anthropic betreibt die Agenten-Schleife und eine Cloud-Sandbox pro Lauf, du lieferst nur die Definition. Jeder Ordner hier ist ein Agent. `ant apply` legt ihn in deinem Konto an.

| Agent | Auftrag | Auslöser | Modell | Kostengrenze pro Lauf |
|---|---|---|---|---|
| `midi-schmiede` | MIDI-Pakete nach Brief (Acid-Lines, Motive, Drums) als Zip | auf Zuruf | Sonnet 5.5 | 1,00 $ |
| `release-manager` | Release-Kit zu einem Track: Metadaten, Texte DE/EN, Tags, Social-Posts | auf Zuruf | Sonnet 5.5 | 1,00 $ |
| `shop-analyst` | Bericht aus Gumroad- und Etsy-Exporten (CSV) mit Kennzahlen und Diagrammen | auf Zuruf | Haiku 5.5 | 0,50 $ |
| `skill-schmied` | Neuer Skill für dieses Repository aus Notizen, als Patch und Zip | auf Zuruf | Opus 5.5 | 2,50 $ |
| `mutator-apex-bot` | Verbessert `ai-agents-factory` täglich um einen geprüften Schritt, liefert `MagicNNN.zip` | täglich 05:17 (Europe/Vienna) | Opus 5.5 | 1,50 $ |

Die Kostengrenze ist ein harter Deckel pro Lauf: Ist er erreicht, pausiert der Agent. MutatorApexBot kostet damit höchstens 46,50 $ im Monat (31 Läufe).

**Stand:** Die Dateien sind gegen die offiziellen Schemas (`platform.claude.com/schemas/ant/beta/`) geprüft. Ein echter Lauf gegen die API steht noch aus.

## Was die Agenten bewusst nicht tun

- **Kein Agent schreibt in ein Repository oder einen Shop.** Jeder liefert Dateien nach `/mnt/session/outputs/`, die du selbst einspielst. Deshalb braucht nur MutatorApexBot ein Token, und das darf nur lesen.
- **Shop-Analyst** arbeitet mit CSV-Exporten, nicht mit den Shop-APIs.
- **MutatorApexBot** kommt nicht an einen Ordner auf deinem Rechner. Er liest das Projekt aus einem privaten GitHub-Repository; `C:\Users\...\ai-agents-factory` muss dafür dorthin gepusht sein.

## Voraussetzungen

- Die `ant`-CLI ab Version 1.34.0 (`ant --version`) und eine Anmeldung (`ant auth login` oder `ANTHROPIC_API_KEY`).
- `jq`. Die Befehle unten sind für Bash geschrieben; unter Windows laufen sie in WSL oder Git Bash.
- Alle Befehle im Wurzelordner dieses Repositorys ausführen. Dort legt `ant apply` die Datei `claude-lock.json` mit den IDs an; behalte sie, sonst entstehen beim nächsten Mal Duplikate.

**Immer die Dateien einzeln nennen, nie `ant apply .`** – sonst lädt `ant` auch die Plugin-Skills unter `skills/` als Managed-Agents-Skills hoch.

## Einen Agenten anlegen

Am Beispiel `midi-schmiede`; für `release-manager`, `shop-analyst` und `skill-schmied` den Ordnernamen tauschen. Erst der Plan, ohne etwas zu ändern:

```bash
ant apply --dry-run -v managed-agents/midi-schmiede/agent.md managed-agents/midi-schmiede/environment.yaml
```

Dann anlegen:

```bash
ant apply managed-agents/midi-schmiede/agent.md managed-agents/midi-schmiede/environment.yaml
```

## Einen Lauf starten

IDs nachschlagen und in `session.yaml` des Agenten anstelle von `YOUR_AGENT_ID` und `YOUR_ENVIRONMENT_ID` eintragen:

```bash
jq -r '.resources["./managed-agents/midi-schmiede/agent.md"].id, .resources["./managed-agents/midi-schmiede/environment.yaml"].id' claude-lock.json
```

Brief in `session.yaml` anpassen und prüfen, dass kein Platzhalter übrig ist (keine Ausgabe heißt: alles ersetzt):

```bash
grep -n YOUR_ managed-agents/midi-schmiede/session.yaml
```

Session starten:

```bash
SID=$(ant beta:sessions create --transform id -r < managed-agents/midi-schmiede/session.yaml)
```

Live zusehen und Rückfragen des Agenten beantworten:

```bash
ant beta:sessions connect "$SID"
```

Ergebnis-Dateien auflisten, sobald der Lauf fertig ist:

```bash
ant beta:files list --scope-id "$SID" --beta managed-agents-2026-04-01
```

Eine Datei herunterladen (ID aus der Liste):

```bash
ant files download --file-id "$FILE_ID" --output acid-nacht-01.zip
```

Für den Shop-Analysten vorher die CSV-Exporte hochladen; die Befehle stehen oben in `shop-analyst/session.yaml`.

## MutatorApexBot einrichten

1. **Projekt nach GitHub.** Leg ein privates Repository `paul1064/ai-agents-factory` an und push den lokalen Ordner dorthin. Heißt es anders, ändere die Zeile `Repository:` in `mutator-apex-bot/deployment-daily.yaml`.
2. **Token.** Erstelle auf GitHub ein Fine-grained Personal Access Token nur für dieses eine Repository mit der Berechtigung „Contents: Read-only“.
3. **Agent, Umgebung, Tresor und Gedächtnis anlegen:**

   ```bash
   ant apply managed-agents/mutator-apex-bot/agent.md managed-agents/mutator-apex-bot/environment.yaml managed-agents/mutator-apex-bot/vault.yaml managed-agents/mutator-apex-bot/memory_store-magic-ledger.yaml
   ```

4. **Token in den Tresor legen.** Die folgenden Blöcke einzeln ausführen. Der erste fragt das Token verdeckt ab, es landet weder in einer Datei noch im Verlauf:

   ```bash
   read -rs CMA_GITHUB_TOKEN && export CMA_GITHUB_TOKEN
   ```

   Prüfen, dass das Token das Repository lesen kann (Ausgabe: der Repository-Name):

   ```bash
   curl -s -H "Authorization: Bearer $CMA_GITHUB_TOKEN" https://api.github.com/repos/paul1064/ai-agents-factory | jq -r .full_name
   ```

   In den Tresor schreiben. Der Agent sieht später nur einen Platzhalter; der echte Wert wird erst unterwegs eingesetzt, und nur für `api.github.com`:

   ```bash
   VAULT_ID=$(jq -r '.resources["./managed-agents/mutator-apex-bot/vault.yaml"].id' claude-lock.json)
   jq -n -f /dev/stdin <<'JQ' | ant beta:vaults:credentials create --vault-id "$VAULT_ID"
   {
     display_name: "GitHub ai-agents-factory (nur lesen)",
     auth: {
       type: "environment_variable",
       secret_name: "GH_TOKEN",
       secret_value: (env.CMA_GITHUB_TOKEN // error("CMA_GITHUB_TOKEN is not set")),
       networking: {type: "limited", allowed_hosts: ["api.github.com"]},
       injection_location: {header: true, body: false}
     }
   }
   JQ
   ```

   Variable wieder löschen:

   ```bash
   unset CMA_GITHUB_TOKEN
   ```

5. **Tresor-ID eintragen.** Den Wert von `echo "$VAULT_ID"` in `deployment-daily.yaml` bei `vault_ids: []` einsetzen, also `vault_ids: [vlt_...]`.
6. **Zeitplan anlegen und sofort pausieren**, damit nichts läuft, bevor du es getestet hast:

   ```bash
   ant apply managed-agents/mutator-apex-bot/deployment-daily.yaml &&
     DEPLOYMENT_ID=$(jq -r '.resources["./managed-agents/mutator-apex-bot/deployment-daily.yaml"].id' claude-lock.json) &&
     ant beta:deployments pause --deployment-id "$DEPLOYMENT_ID"
   ```

7. **Probelauf von Hand** (geht auch im pausierten Zustand):

   ```bash
   ant beta:deployments run --deployment-id "$DEPLOYMENT_ID"
   ```

   Die Session-ID des Laufs:

   ```bash
   ant beta:deployment-runs list --deployment-id "$DEPLOYMENT_ID" --max-items 1
   ```

   Mit dieser ID wie oben zusehen (`ant beta:sessions connect`) und `Magic001.zip` herunterladen (`ant beta:files list`, `ant files download`).
8. **Einschalten**, wenn der Probelauf gut aussieht:

   ```bash
   ant beta:deployments unpause --deployment-id "$DEPLOYMENT_ID"
   ```

### Die tägliche Zip

`MagicNNN.zip` enthält `REPORT.md` (was sich ändert, Messwert vorher und nachher, Einspielen, Zurücknehmen), `changes.patch` und unter `files/` die geänderten Dateien in voller Länge. Einspielen im Projektordner mit `git apply changes.patch`, oder den Inhalt von `files/` über den Ordner kopieren. Danach committen und pushen, damit der nächste Lauf auf dem neuen Stand aufbaut. Findet der Bot an einem Tag nichts, das alle Prüfungen besteht, enthält die Zip nur den Bericht.

Die Nummer, die Karte des Projekts und die Ideenliste hält der Bot im Gedächtnis `magic-ledger` fest. Anhalten geht jederzeit mit `ant beta:deployments pause --deployment-id "$DEPLOYMENT_ID"`.

## Ändern

Datei bearbeiten, dann dieselbe Datei erneut mit `ant apply` anwenden. Ein geänderter Agent bekommt eine neue Version. Die Rubriken in `session.yaml` und `deployment-daily.yaml` sind Startfassungen: Ein unabhängiger Prüfer bewertet jedes Ergebnis daran und schickt den Agenten bei Lücken in eine zweite Runde.
