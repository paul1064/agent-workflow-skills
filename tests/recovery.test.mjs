// Tests für Wiederholung, Halt und Wiederaufnahme des Explorers.   node --test tests/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, readFileSync, mkdtempSync, existsSync, truncateSync, statSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const EXPLORE = here("../skills/oracle-first-exploration/scripts/explore.mjs");
const EXAMPLES = here("../skills/oracle-first-exploration/examples/");
const tmp = mkdtempSync(join(tmpdir(), "explore-recovery-"));
const file = (name) => join(tmp, name);
const adapter = (name, src) => { const p = file(name + ".mjs"); writeFileSync(p, src); return p; };
const run = (args, env = {}) => spawnSync(process.execPath, [EXPLORE, ...args], { encoding: "utf8", env: { ...process.env, ...env } });
const goal = (out) => out.split("\n").find((l) => l.startsWith("ZIEL  "))?.slice(6);
const stat = (out, name) => +new RegExp(name + "=(\\d+)").exec(out.split("\n").filter((l) => l.startsWith("zustände=")).pop())[1];

// Startet einen Lauf und schickt ihm ein Signal, sobald `ready()` wahr ist. Liefert Exit-Code und Ausgabe.
// Kein fester Zeitpunkt: auf einer langsamen Maschine käme das Signal sonst zu früh oder zu spät.
function runAndSignal(args, ready, signal = "SIGINT") {
  return new Promise((done) => {
    const p = spawn(process.execPath, [EXPLORE, ...args]);
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    const t = setInterval(() => { if (ready()) { clearInterval(t); p.kill(signal); } }, 10);
    p.on("close", (code) => { clearInterval(t); done({ status: code, stdout: out }); });
  });
}

// Zahlenschloss mit zwei Rädern und langsamen Schritten: lang genug, um mittendrin zu unterbrechen.
const SLOW = adapter("langsam", `
  export const initial = { r: [0, 0] };
  export const actions = () => ["a+", "a-", "b+", "b-", "zieh"];
  export async function step(s, x) {
    await new Promise((r) => setTimeout(r, 3));
    if (x === "zieh") return s.r.join("") === "55" ? { state: s, goal: true } : null;
    const r = [...s.r], i = x[0] === "a" ? 0 : 1;
    r[i] = (r[i] + (x[1] === "+" ? 1 : 9)) % 10;
    return { state: { r } };
  }
  export const key = (s) => s.r.join("");`);
const SLOW_ARGS = [SLOW, "--conc", "1", "--depth", "30"];

// Kette, deren vierter Schritt scheitert, solange eine Markierungsdatei existiert.
const OUTAGE = adapter("ausfall", `
  import { existsSync } from "node:fs";
  export const initial = { n: 0 };
  export const actions = () => ["weiter", "nichts"];
  export async function step(s, a) {
    if (a === "nichts") return null;
    if (s.n === 3 && existsSync(process.env.DOWN_FILE)) throw new Error("503 Dienst nicht erreichbar");
    return { state: { n: s.n + 1 }, goal: s.n === 6 };
  }`);

test("wackeliger Schritt: Wiederholungen heilen ihn ohne Spur im Ergebnis", () => {
  const flaky = adapter("wackelig", `
    const tries = new Map();
    export const initial = { n: 0 };
    export const actions = () => ["a", "b"];
    export async function step(s, a) {
      const k = s.n + a, c = (tries.get(k) || 0) + 1;
      tries.set(k, c);
      if (c <= 2) throw new Error("Zeitüberschreitung");
      return a === "b" ? null : { state: { n: s.n + 1 }, goal: s.n === 5 };
    }`);
  const r = run([flaky, "--retries", "2", "--backoff", "1"]);
  assert.equal(r.status, 0, r.stdout);
  assert.equal(goal(r.stdout), "a > a > a > a > a > a");
  assert.doesNotMatch(r.stdout, /FEHLER|unvollständig|Hinweis/);
});

test("dauerhaft fehlschlagender Schritt: gemeldet, Exit 3, kein Absturz", () => {
  const down = file("down-1");
  writeFileSync(down, "");
  const r = run([OUTAGE, "--retries", "1", "--backoff", "1"], { DOWN_FILE: down });
  assert.equal(r.status, 3, r.stdout);
  assert.match(r.stdout, /FEHLER weiter > weiter > weiter > weiter {2}– {2}503 Dienst nicht erreichbar/);
  assert.match(r.stdout, /unvollständig: 1 Schritt\(e\) fehlgeschlagen\. Mit --checkpoint/);
  assert.doesNotMatch(r.stdout, /alle erreichbaren Zustände durchsucht/);
  assert.equal(r.stderr, "");
});

test("Ausfall mit Checkpoint: der nächste Lauf holt den Schritt nach und findet das Ziel", () => {
  const down = file("down-2"), ck = file("ausfall.ck");
  writeFileSync(down, "");
  const first = run([OUTAGE, "--retries", "0", "--checkpoint", ck], { DOWN_FILE: down });
  assert.equal(first.status, 3, first.stdout);
  assert.match(first.stdout, /Stand gesichert in /);
  rmSync(down);
  const second = run([OUTAGE, "--retries", "0", "--checkpoint", ck], { DOWN_FILE: down });
  assert.equal(second.status, 0, second.stdout);
  assert.match(second.stdout, /~ Stand geladen aus .*nachzuholen=1/);
  assert.equal(goal(second.stdout), "weiter > weiter > weiter > weiter > weiter > weiter > weiter");
  assert.match(second.stdout, /Hinweis: Es gab fehlgeschlagene Schritte/);
  assert.doesNotMatch(second.stdout, /FEHLER/);
});

test("System weg: nach --max-fail Fehlern in Folge hält die Suche an", () => {
  const dead = adapter("tot", `
    export const initial = { n: 0 };
    export const actions = () => ["a", "b", "c", "d", "e", "f", "g", "h"];
    export async function step() { throw new Error("ECONNREFUSED"); }`);
  const r = run([dead, "--retries", "0", "--max-fail", "5", "--conc", "1"]);
  assert.equal(r.status, 3, r.stdout);
  assert.match(r.stdout, /ABBRUCH: System antwortet nicht \(5 Fehler in Folge\)/);
  assert.equal(stat(r.stdout, "aufrufe"), 5);
});

test("Fehler in key(): Halt mit Bericht statt Absturz", () => {
  const bad = adapter("kaputter-key", `
    export const initial = { n: 0 };
    export const actions = () => ["weiter"];
    export async function step(s) { return { state: { n: s.n + 1 } }; }
    export const key = (s) => { if (s.n === 3) throw new Error("key kaputt"); return s.n; };`);
  const r = run([bad]);
  assert.equal(r.status, 3, r.stdout);
  assert.match(r.stdout, /ABBRUCH: Fehler im Adapter: key kaputt/);
  assert.equal(r.stderr, "");
});

test("Strg+C: Stand wird gesichert, Fortsetzung liefert dasselbe wie ein Lauf am Stück", async () => {
  const ck = file("signal.ck");
  const whole = run(SLOW_ARGS);
  assert.equal(whole.status, 0, whole.stdout);

  const cut = await runAndSignal([...SLOW_ARGS, "--checkpoint", ck, "--checkpoint-every", "0.05"], () => existsSync(ck));
  assert.equal(cut.status, 3, cut.stdout);
  assert.match(cut.stdout, /ABBRUCH: Signal SIGINT/);
  assert.match(cut.stdout, /Stand gesichert in /);
  assert.ok(stat(cut.stdout, "aufrufe") < stat(whole.stdout, "aufrufe"), "der Lauf war schon fertig, bevor das Signal kam");

  const resumed = run([...SLOW_ARGS, "--checkpoint", ck]);
  assert.equal(resumed.status, 0, resumed.stdout);
  assert.equal(goal(resumed.stdout), goal(whole.stdout));
  assert.equal(stat(resumed.stdout, "aufrufe"), stat(whole.stdout, "aufrufe"), "kein Schritt doppelt, keiner verloren");
  assert.equal(stat(resumed.stdout, "zustände"), stat(whole.stdout, "zustände"));
});

test("Strg+C erreicht auch einen Adapter, der ohne Wartezeit antwortet", async () => {
  const ck = file("schnell.ck"), grid = here("../tools/grid-adapter.mjs");
  const p = spawn(process.execPath, [EXPLORE, grid, "--depth", "1000000", "--nodes", "1000000000", "--checkpoint", ck, "--checkpoint-every", "0.2"], { env: { ...process.env, W: "3000" } });
  let out = "";
  p.stdout.on("data", (d) => (out += d));
  const t = setInterval(() => { if (existsSync(ck)) { clearInterval(t); p.kill("SIGINT"); } }, 10);
  const status = await new Promise((done) => p.on("close", done));
  clearInterval(t);
  assert.equal(status, 3, out.slice(-400));
  assert.match(out, /ABBRUCH: Signal SIGINT/);
  assert.ok(stat(out, "zustände") < 3000 * 3000 - 1, "der Lauf lief bis zum Ende durch");
});

test("harter Abbruch (SIGKILL): die letzte Zwischensicherung trägt, das Ergebnis bleibt gleich", async () => {
  const ck = file("kill.ck");
  const whole = run(SLOW_ARGS);
  const cut = await runAndSignal([...SLOW_ARGS, "--checkpoint", ck, "--checkpoint-every", "0.05"], () => existsSync(ck), "SIGKILL");
  assert.notEqual(cut.status, 0);
  assert.doesNotMatch(cut.stdout, /== Ergebnis/);
  const resumed = run([...SLOW_ARGS, "--checkpoint", ck]);
  assert.equal(resumed.status, 0, resumed.stdout);
  assert.match(resumed.stdout, /~ Stand geladen aus /);
  assert.equal(goal(resumed.stdout), goal(whole.stdout));
  assert.equal(stat(resumed.stdout, "aufrufe"), stat(whole.stdout, "aufrufe"));
  assert.equal(stat(resumed.stdout, "zustände"), stat(whole.stdout, "zustände"));
});

test("beschädigte Sicherung: die vorige (.bak) springt ein", async () => {
  const ck = file("kaputt.ck");
  const whole = run(SLOW_ARGS);
  const cut = await runAndSignal([...SLOW_ARGS, "--checkpoint", ck, "--checkpoint-every", "0.05"], () => existsSync(ck + ".bak"));
  assert.equal(cut.status, 3, cut.stdout);
  assert.ok(existsSync(ck + ".bak"), "es gab noch keine zweite Sicherung");
  truncateSync(ck, Math.floor(statSync(ck).size / 2));

  const resumed = run([...SLOW_ARGS, "--checkpoint", ck]);
  assert.equal(resumed.status, 0, resumed.stdout);
  assert.match(resumed.stdout, /! Checkpoint .*kaputt\.ck unbrauchbar/);
  assert.match(resumed.stdout, /~ Stand geladen aus .*kaputt\.ck\.bak/);
  assert.equal(goal(resumed.stdout), goal(whole.stdout));
  assert.equal(stat(resumed.stdout, "zustände"), stat(whole.stdout, "zustände"));
});

test("veränderte Sicherung fällt an der Prüfsumme auf; ohne brauchbare Sicherung beginnt die Suche neu", () => {
  const ck = file("gefaelscht.ck");
  assert.equal(run([EXAMPLES + "labyrinth.mjs", "--depth", "3", "--checkpoint", ck]).status, 1);
  writeFileSync(ck, readFileSync(ck, "utf8").replace('"depth":4', '"depth":2'));
  const r = run([EXAMPLES + "labyrinth.mjs", "--checkpoint", ck]);
  assert.match(r.stdout, /unbrauchbar \(Prüfsumme stimmt nicht\)/);
  assert.match(r.stdout, /Keine brauchbare Sicherung – Suche beginnt von vorn/);
  assert.equal(r.status, 0, r.stdout);
  assert.equal(goal(r.stdout), "süd > süd > süd > süd > ost > ost > ost > ost > ost > ost");
});

test("Checkpoint eines anderen Adapters wird abgelehnt: Exit 2", () => {
  const ck = file("fremd.ck");
  run([EXAMPLES + "labyrinth.mjs", "--depth", "3", "--checkpoint", ck]);
  const r = run([EXAMPLES + "zahlenschloss.mjs", "--checkpoint", ck]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /gehört zu einem anderen oder geänderten Adapter/);
});

test("Tiefe erreicht: derselbe Checkpoint mit größerer Tiefe sucht weiter statt von vorn", () => {
  const ck = file("tiefe.ck"), lab = EXAMPLES + "labyrinth.mjs";
  const whole = run([lab]);
  const shallow = run([lab, "--depth", "3", "--checkpoint", ck]);
  assert.equal(shallow.status, 1, shallow.stdout);
  const deep = run([lab, "--checkpoint", ck]);
  assert.equal(deep.status, 0, deep.stdout);
  assert.equal(goal(deep.stdout), goal(whole.stdout));
  assert.equal(stat(deep.stdout, "aufrufe"), stat(whole.stdout, "aufrufe"));
  assert.match(deep.stdout, /FALLE süd > süd > ost > ost > ost {2}– {2}Grube/);
});

test("fertiger Lauf: derselbe Aufruf meldet das Ergebnis erneut, ohne neu zu suchen", () => {
  const ck = file("fertig.ck"), lab = EXAMPLES + "labyrinth.mjs";
  const first = run([lab, "--checkpoint", ck]);
  const again = run([lab, "--checkpoint", ck]);
  assert.equal(again.status, 0);
  assert.equal(goal(again.stdout), goal(first.stdout));
  assert.equal(stat(again.stdout, "aufrufe"), stat(first.stdout, "aufrufe"));
});

test("wenig Speicher: Halt mit Sicherung statt Absturz, Fortsetzung mit mehr Speicher", () => {
  const ck = file("speicher.ck"), grid = here("../tools/grid-adapter.mjs"), args = [EXPLORE, grid, "--depth", "100000", "--nodes", "100000000", "--checkpoint", ck];
  const env = { ...process.env, W: "700" };
  const small = spawnSync(process.execPath, ["--max-old-space-size=40", ...args], { encoding: "utf8", env });
  assert.equal(small.status, 3, small.stdout.slice(-600) + small.stderr.slice(-600));
  assert.match(small.stdout, /ABBRUCH: Speicher fast voll/);
  const big = spawnSync(process.execPath, args, { encoding: "utf8", env });
  assert.equal(big.status, 0, big.stdout.slice(-600));
  assert.equal(stat(big.stdout, "zustände"), 489999);
  assert.equal(stat(big.stdout, "aufrufe"), 1959996);
});
