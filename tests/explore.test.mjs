// Tests für den Explorer und alle Beispiel-Adapter.   node --test tests/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const EXPLORE = here("../skills/oracle-first-exploration/scripts/explore.mjs");
const EXAMPLES = here("../skills/oracle-first-exploration/examples/");
const run = (adapter, ...args) => spawnSync(process.execPath, [EXPLORE, adapter, ...args], { encoding: "utf8" });
const goals = (out) => out.split("\n").filter((l) => l.startsWith("ZIEL  ")).map((l) => l.slice(6));
const tmp = mkdtempSync(join(tmpdir(), "explore-test-"));
const adapter = (name, src) => { const p = join(tmp, name + ".mjs"); writeFileSync(p, src); return p; };

// Erwarteter kürzester Pfad je Beispiel. Ein neues Beispiel ohne Eintrag lässt den Test scheitern.
const EXPECTED = {
  "toy-adapter.mjs": "links > links > rechts > links > öffne",
  "zahlenschloss.mjs": "rad1+ > rad1+ > rad1+ > rad1+ > rad2- > rad2- > rad2- > rad3+ > ziehen",
  "labyrinth.mjs": "süd > süd > süd > süd > ost > ost > ost > ost > ost > ost",
  "api-blaettern.mjs": "filter=archiv > weiter > weiter > lesen",
  "config-schalter.mjs": "schalte:cache > schalte:tls > schalte:http2 > schalte:gzip > bauen",
};

test("jedes Beispiel hat einen erwarteten Pfad", () => {
  assert.deepEqual(readdirSync(EXAMPLES).sort(), Object.keys(EXPECTED).sort());
});

for (const [file, path] of Object.entries(EXPECTED)) {
  test(`Beispiel ${file} findet den kürzesten Pfad`, () => {
    const r = run(EXAMPLES + file);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.deepEqual(goals(r.stdout), [path]);
  });
}

test("Fallen werden gemeldet und nicht weiterverfolgt", () => {
  assert.match(run(EXAMPLES + "labyrinth.mjs").stdout, /FALLE süd > süd > ost > ost > ost {2}– {2}Grube/);
});

test("nie wirksame Aktionen werden genannt", () => {
  assert.match(run(EXAMPLES + "toy-adapter.mjs").stdout, /nie wirksam .*: warte/);
});

test("ohne Adapter: Exit 2", () => {
  assert.equal(spawnSync(process.execPath, [EXPLORE], { encoding: "utf8" }).status, 2);
});

test("kein Ziel innerhalb der Tiefe: Exit 1", () => {
  const r = run(EXAMPLES + "labyrinth.mjs", "--depth", "3");
  assert.equal(r.status, 1);
  assert.match(r.stdout, /kein Ziel gefunden/);
});

test("Knotenbudget bricht die Suche ab", () => {
  const r = run(EXAMPLES + "zahlenschloss.mjs", "--nodes", "50");
  assert.equal(r.status, 1);
  assert.match(r.stdout, /Knotenbudget 50 erreicht/);
});

test("--all sammelt mehrere Ziele", () => {
  const a = adapter("zwei-ziele", `
    export const initial = { n: 0 };
    export const actions = () => ["a", "b"];
    export async function step(s, x) { return s.n === 1 ? { state: s, goal: true } : { state: { n: 1 } }; }`);
  assert.equal(goals(run(a).stdout).length, 1);
  assert.ok(goals(run(a, "--all").stdout).length > 1);
});

test("Zyklen enden; ohne key() gilt der ganze Zustand als Identität", () => {
  const a = adapter("kreis", `
    export const initial = { n: 0 };
    export const actions = () => ["weiter"];
    export async function step(s) { return { state: { n: (s.n + 1) % 5 } }; }`);
  const r = run(a, "--depth", "1000");
  assert.equal(r.status, 1);
  assert.match(r.stdout, /zustände=5 /);
});

test("langer Pfad kommt vollständig und in der richtigen Reihenfolge heraus", () => {
  const a = adapter("kette", `
    export const initial = { n: 0 };
    export const actions = (s) => ["s" + s.n];
    export async function step(s) { return { state: { n: s.n + 1 }, goal: s.n === 299 }; }`);
  const r = run(a, "--depth", "500");
  assert.equal(r.status, 0);
  assert.deepEqual(goals(r.stdout)[0].split(" > "), Array.from({ length: 300 }, (_, i) => "s" + i));
});

test("verteiltes Zustands-Set liefert dasselbe Ergebnis wie ein einzelnes", () => {
  const one = run(EXAMPLES + "zahlenschloss.mjs", "--all");
  const many = spawnSync(process.execPath, [EXPLORE, EXAMPLES + "zahlenschloss.mjs", "--all"], { encoding: "utf8", env: { ...process.env, EXPLORE_SHARD: "7" } });
  const strip = (o) => o.replace(/zeit=\d+ms/, "");
  assert.equal(many.status, 0);
  assert.equal(strip(many.stdout), strip(one.stdout));
});
