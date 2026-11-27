# Auftrag: GitHub-Audit vom 26.11.2026 in einem Razz abarbeiten

Zum Einfügen in Antigravity oder Claude Code. Der Auftrag steht für sich und braucht kein vorheriges Gespräch.

```
/razz

Arbeite die folgende Liste aus dem Sicherheits- und Aufräum-Audit meiner GitHub-Repos
(Account paul1064) nach dem Skill `razz` ab: pro Repo ein Branch `razz/audit-2026-11`
und ein Pull Request als Entwurf, ein Commit pro Punkt, nie direkt auf den Default-Branch,
nichts mergen. Geheimnisse nie im Wortlaut ausgeben.

Zeig mir zuerst die Sortiertabelle (Klasse A/B/C, Plan, Erfolgssignal) und warte auf mein
"go", weil in AetherOS ausführbarer Code geändert wird.

KLASSE A – umsetzen

paul1064/ExpertSol
 2. Den GMGN-API-Schlüssel (Muster `gmgn_` + Hex) an allen Stellen durch den Platzhalter
    `your_gmgn_api_key` ersetzen. Dateien: `config/.env.example` (Z. 6),
    `GMGN_INTEGRATION_COMPLETE.md` (Z. 99, 224),
    `solana-sniper-pro/integrations/README.md` (Z. 41, 61, 145, 274, 329).
    Signal: Suche nach `gmgn_[a-f0-9]{20,}` im Arbeitsbaum = 0 Treffer.
20. `README.md` mit einem Absatz füllen (Solana-Trading-Bot, Status ruhend, keine
    Anlageberatung). Leere `logs/bot.log` aus dem Tracking nehmen, `logs/` in `.gitignore`.

paul1064/AetherOS
 4. `lib/aether_core.py`: `run_command` ohne `shell=True` ausführen (`shlex.split`),
    in `command_allowed` und `command_allowed_for_source` exakt bzw. auf Token-Ebene
    vergleichen, Befehle mit `;`, `&&`, `||`, `|`, `` ` ``, `$(`, `>` ablehnen.
    Signal: `python -m py_compile`, flake8 wie in der CI, kleiner Test, der
    `ls; id` als blockiert und `ls` als erlaubt zeigt.
 5. `systemd/*.service` (12 Dateien): `User=` und `Group=` setzen, dazu
    `NoNewPrivileges=yes`, `ProtectSystem=full`, `PrivateTmp=yes`. Der fest verdrahtete
    Benutzer `miqua` bleibt vorerst als Wert stehen. Ausnahme: `aether-snapshot.service`
    braucht Root für Btrfs, dort nur die Härtung, kein `User=`.
    Signal: `systemd-analyze verify` falls vorhanden, sonst Syntax per Lesen.
 6. `lib/aether_api_app.py` und `lib/aether_api_client.py`: Token-Prüfung für alle
    POST-Endpunkte. Token aus `runtime/state/api.token` (0600), beim ersten Start erzeugt,
    Vergleich mit `hmac.compare_digest`. GET bleibt offen.
    Signal: py_compile, flake8, POST ohne Token = 401 im Test-Client.
 7. `bootstrap/prepare-base.sh`: `curl … | sh` für Ollama ersetzen: Installer in eine
    Datei laden, SHA-256 anzeigen, erst nach Bestätigung ausführen
    (`AETHER_ASSUME_YES=1` überspringt die Frage). In `usermod` die Gruppe `sudo` streichen.
    Signal: `bash -n`. Skript nicht ausführen.
 8. `install/disk-layout.sh`: vor `parted`/`mkfs` Gerät, Größe und Modell anzeigen und
    das Eintippen des Gerätenamens verlangen. Schalter `--yes` für unbeaufsichtigte Läufe.
    Signal: `bash -n`. Skript nicht ausführen.
 9. Aus dem Tracking nehmen (`git rm --cached`): `data/sqlite/aether.db`,
    `runtime/logs/`, `lib/__pycache__/`, `dist/`. In `.gitignore` `data/` und `runtime/`
    ergänzen. Signal: `git ls-files` für diese Pfade leer.
10. `.github/workflows/ci.yml`: oben `permissions: contents: read`, alle `|| true`
    entfernen, den CodeQL-Schritt um `github/codeql-action/init` ergänzen und dem Job
    `security-events: write` geben. Signal: YAML lädt, CI-Lauf im Pull Request.
11. `SECURITY.md`, `pyproject.toml`: Adressen unter `aetheros.dev` entfernen, stattdessen
    auf GitHub Security Advisories des Repos verweisen.
12. `README.md`, `config/aether.yaml`: Status „Prototyp, nicht auf Produktivrechnern
    installieren“ an den Anfang, Hinweis dass der Subagent ein Platzhalter ist und es
    keine Tests gibt, Version in `config/aether.yaml` an `VERSION` angleichen.
13. `TBC.md`, Abschnitt „Verhältnis zum bestehenden Repo“: Urteil ergänzen – die
    RSI-Idee wird ein eigenes Projekt, als kleiner Messaufbau neben `paul1064/ie-h`;
    der Meta-Agent hier verteilt nur Jobs und ist kein Andockpunkt.

paul1064/the_singularity_x.144
14. `README.md`: Hinweis, dass die APKs in `release/` mit einem öffentlichen
    Debug-Schlüssel signiert sind und nur aus diesem Repo installiert werden sollten.

paul1064/mockup2035-design
18. `node_modules/` aus dem Tracking nehmen, `.gitignore` (node_modules, dist) anlegen,
    kurzes `README.md` (React/Vite-Mockup, `npm install`, `npm run dev`).
    Signal: `git ls-files | grep -c node_modules` = 0, `npm ci && npm run build` läuft.

paul1064/MetaTrade
19. `crypto-bot/__pycache__/` aus dem Tracking nehmen, `__pycache__/` in `.gitignore`.

paul1064/ie-h, paul1064/pce-neon, paul1064/the_singularity_x.144,
nobis23-werkstatt/multie, nobis23-werkstatt/si-algo, paul1064/AetherOS
22. In `.github/workflows/*.yml` jede `uses:`-Zeile auf den Commit-SHA des aktuell
    genutzten Tags pinnen, Tag als Kommentar dahinter (`# v4`). SHA per API nachschlagen,
    nicht raten. Signal: CI-Lauf im Pull Request grün.

KLASSE B – nicht umsetzen, am Ende fragen

17. paul1064/wasserhaerte-oesterreich: Impressum, Amazon-Partner-Tag und Sitemap-Adresse
    in `build.py` einsetzen und `docs/` neu bauen. Braucht von mir: Name, Anschrift,
    Partner-Tag, endgültige Adresse der Seite.
15. paul1064/the_singularity_x.144: echten Signaturschlüssel über Actions-Secrets.
    Braucht von mir: Keystore und Secrets, und die Entscheidung, ob bestehende
    Installationen einmal neu installiert werden dürfen.

KLASSE C – nie ausführen, nur im Bericht nennen

 1. GMGN-Schlüssel widerrufen und neu ausstellen (GMGN-Konto). Dringendster Punkt.
 3. ExpertSol: Historie bereinigen oder Repo auf privat stellen.
16. GitHub-Konto: „Keep my email addresses private“ und „Block command line pushes
    that expose my email“ einschalten.
23. Leere Repos archivieren oder löschen: Cryptokitties, mock35,
    nobis23-werkstatt/rk-singularity-45.

Schon erledigt: 21 (focus-flow README).

Abschluss: Bericht nach Abschnitt 5 des Skills, eine Zeile pro Nummer.
```
