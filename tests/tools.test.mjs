// Tests für die Hilfsskripte: Skill-Prüfung, Messung, Benchmark.   node --test tests/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const node = (...args) => spawnSync(process.execPath, args, { encoding: "utf8" });
const MEASURE = here("../skills/scale-it/scripts/measure.mjs");

function project(files) {
  const dir = mkdtempSync(join(tmpdir(), "measure-test-"));
  for (const [f, lines] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, f)), { recursive: true });
    writeFileSync(join(dir, f), Array(lines).fill("x").join("\n"));
  }
  return dir;
}

test("check-skills: Repo ist in sich stimmig", () => {
  const r = node(here("../tools/check-skills.mjs"));
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /abweichungen=0/);
});

test("measure: zählt Code, Tests und CI getrennt, überspringt node_modules", () => {
  const dir = project({ "src/a.js": 10, "src/b.py": 30, "tests/a.test.js": 5, "README.md": 3, ".github/workflows/ci.yml": 2, "node_modules/x/i.js": 99 });
  const m = JSON.parse(node(MEASURE, dir, "--json").stdout);
  const w = m.werte;
  assert.deepEqual(
    [w.code_dateien, w.code_zeilen, w.test_dateien, w.test_zeilen, w.ci_workflows, w.groesste_code_datei_zeilen],
    [2, 40, 1, 5, 1, 30]);
  assert.equal(m.groesste_code_datei, "src/b.py");
});

test("measure --compare: nennt den Faktor je Messgröße", () => {
  const before = project({ "a.js": 10 }), after = project({ "a.js": 10, "b.js": 20, "test/b.test.js": 4 });
  const saved = join(mkdtempSync(join(tmpdir(), "measure-save-")), "vorher.json");
  writeFileSync(saved, node(MEASURE, before, "--json").stdout);
  const out = node(MEASURE, after, "--compare", saved).stdout;
  assert.match(out, /code_zeilen\s+10\s+30\s+×3\.00/);
  assert.match(out, /test_dateien\s+0\s+1\s+neu/);
});

test("bench: liefert Zustände und Zeit je Stufe", () => {
  const r = node(here("../tools/bench.mjs"), "10", "30");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /W=10 {2}zustände=99 /);
  assert.match(r.stdout, /W=30 {2}zustände=899 .*zustände ×9\.1/);
});
