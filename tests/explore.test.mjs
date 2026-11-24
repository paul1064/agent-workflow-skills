// Grenzfälle für explore.mjs. Ausführen: node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { explore } from "../skills/oracle-first-exploration/scripts/explore.mjs";

const CLI = fileURLToPath(new URL("../skills/oracle-first-exploration/scripts/explore.mjs", import.meta.url));
const EX = (f) => fileURLToPath(new URL("../skills/oracle-first-exploration/examples/" + f, import.meta.url));
const MODES = ["bfs", "astar"];

// Zähler-Graph: +1 / *2, Ziel bei n === target.
const counter = (target, extra = {}) => ({
  initial: 1,
  actions: () => ["+1", "*2"],
  step: async (n, a) => { const m = a === "+1" ? n + 1 : n * 2; return m > target ? null : { state: m, goal: m === target }; },
  ...extra,
});

for (const mode of MODES) {
  test(`${mode}: Ziel in Tiefe 1`, async () => {
    const r = await explore(counter(2), { mode });
    assert.equal(r.goals.length, 1);
    assert.equal(r.goals[0].path.length, 1);
  });

  test(`${mode}: findet kürzesten Pfad (1 -> 10 in 4 Schritten)`, async () => {
    const r = await explore(counter(10), { mode });
    assert.equal(r.goals[0].path.length, 4);
  });

  test(`${mode}: kein Ziel -> leere goals, kein Absturz`, async () => {
    const r = await explore({ initial: 0, actions: () => ["x"], step: async () => null }, { mode });
    assert.deepEqual(r.goals, []);
    assert.deepEqual(r.dead, ["x"]);
  });

  test(`${mode}: Zyklen terminieren (Deduplizierung)`, async () => {
    const ring = { initial: 0, actions: () => ["weiter", "zurück"], step: async (s, a) => ({ state: (s + (a === "weiter" ? 1 : 4)) % 5 }) };
    const r = await explore(ring, { mode, depth: 1000 });
    assert.equal(r.goals.length, 0);
    assert.equal(r.states, 5);
  });

  test(`${mode}: Falle wird einmal gemeldet und gezählt, nicht weiter verfolgt`, async () => {
    const A = {
      initial: 0, actions: () => ["a", "loch"],
      step: async (s, a) => (a === "loch" ? { state: -1, trap: "Loch" } : s < 3 ? { state: s + 1 } : null),
    };
    const r = await explore(A, { mode });
    assert.equal(r.traps.length, 1);
    assert.equal(r.traps[0].path.join(), "loch");
    assert.equal(r.traps[0].n, 4);
  });

  test(`${mode}: Tiefenlimit greift`, async () => {
    const r = await explore(counter(10), { mode, depth: 3 });
    assert.equal(r.goals.length, 0);
  });

  test(`${mode}: Knotenbudget greift und wird gemeldet`, async () => {
    const inf = { initial: 0, actions: () => ["a", "b"], step: async (s, a) => ({ state: s * 2 + (a === "a" ? 1 : 2) }) };
    const r = await explore(inf, { mode, nodes: 50, depth: 100 });
    assert.equal(r.budgetHit, true);
    assert.ok(r.states < 200);
  });

  test(`${mode}: --all liefert mehrere Ziele`, async () => {
    const A = { initial: "s", actions: (s) => (s === "s" ? ["x", "y"] : []), step: async (s, a) => ({ state: a, goal: true }) };
    const r = await explore(A, { mode, all: true });
    assert.equal(r.goals.length, 2);
  });

  test(`${mode}: kaputter Adapter wirft verständlichen Fehler`, async () => {
    await assert.rejects(explore({ initial: 0 }, { mode }), /es fehlt: actions, step/);
    await assert.rejects(explore({ initial: 0, actions: () => "x", step: async () => null }, { mode }), /Array/);
    await assert.rejects(explore({ initial: 0, actions: () => ["x"], step: async () => ({ state: 1, cost: -1 }) }, { mode }), /cost/);
  });

  test(`${mode}: langsame step() laufen parallel`, async () => {
    const A = { initial: 0, actions: (s) => (s === 0 ? Array.from({ length: 16 }, (_, i) => "a" + i) : []), step: async (s, a) => { await new Promise((r) => setTimeout(r, 50)); return { state: a }; } };
    const t = Date.now();
    await explore(A, { mode, conc: 16 });
    assert.ok(Date.now() - t < 400, "16 × 50 ms sollten parallel deutlich unter 800 ms bleiben");
  });
}

test("bfs: key() fasst gleichwertige Zustände zusammen", async () => {
  const A = { initial: { n: 0, junk: 0 }, actions: () => ["a"], step: async (s) => ({ state: { n: (s.n + 1) % 3, junk: Math.random() } }), key: (s) => String(s.n) };
  const r = await explore(A, { depth: 50 });
  assert.equal(r.states, 3);
});

test("astar: günstigster statt kürzester Pfad", async () => {
  // direkt: 1 Schritt, Kosten 10; Umweg: 3 Schritte, je 1
  const A = {
    initial: "S",
    actions: (s) => ({ S: ["direkt", "u1"], U1: ["u2"], U2: ["u3"] }[s] || []),
    step: async (s, a) => ({ direkt: { state: "G", goal: true, cost: 10 }, u1: { state: "U1" }, u2: { state: "U2" }, u3: { state: "G", goal: true } }[a]),
  };
  assert.equal((await explore(A, { mode: "bfs" })).goals[0].path.join(), "direkt");
  const r = await explore(A, { mode: "astar" });
  assert.equal(r.goals[0].path.join(), "u1,u2,u3");
  assert.equal(r.goals[0].cost, 3);
});

test("astar: Heuristik spart Knoten im Spiel-Beispiel, Kosten bleiben optimal", async () => {
  const game = await import(EX("game-adapter.mjs"));
  const withH = await explore(game, { mode: "astar", depth: 30 });
  const { heuristic, ...noH } = game;
  const without = await explore(noH, { mode: "astar", depth: 30 });
  assert.equal(withH.goals[0].cost, 15);
  assert.equal(without.goals[0].cost, 15);
  assert.ok(withH.calls <= without.calls);
});

test("alle Beispiele finden ihr Ziel", async () => {
  for (const [f, o] of [["toy-adapter.mjs", {}], ["api-adapter.mjs", {}], ["config-adapter.mjs", {}], ["game-adapter.mjs", { mode: "astar", depth: 30 }]]) {
    const r = await explore(await import(EX(f)), o);
    assert.equal(r.goals.length, 1, f);
  }
});

test("CLI: Exit-Codes 0 / 1 / 2", () => {
  const run = (...a) => spawnSync(process.execPath, [CLI, ...a], { encoding: "utf8" }).status;
  assert.equal(run(EX("toy-adapter.mjs")), 0);
  assert.equal(run(EX("toy-adapter.mjs"), "--depth", "2"), 1);
  assert.equal(run(), 2);
  assert.equal(run(EX("toy-adapter.mjs"), "--mode", "dfs"), 2);
});
