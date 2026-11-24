#!/usr/bin/env node
// Generischer Zustandsgraph-Explorer (BFS) mit Budget, Deduplizierung und Fallen-Bericht.
//
//   node explore.mjs <adapter.mjs> [--depth 12] [--nodes 5000] [--conc 16] [--all]
//
// Der Adapter (ES-Modul) beschreibt das System, das du erkundest:
//   export const initial = {...};                     // Startzustand (JSON-serialisierbar)
//   export function actions(state) { return [...] }   // Kandidaten-Aktionen (Strings)
//   export async function step(state, action) {       // Eine Aktion ausprobieren
//     return null;                                     //   -> keine Wirkung
//     return { state, note, goal, trap, cost };        //   -> neuer Zustand (+ optional:
//   }                                                  //      goal=true Ziel, trap="Grund" nicht weiter)
//   export function key(state) { return "..." }       // optional: Identität eines Zustands
//
// Ausgabe: erster (kürzester) Pfad zum Ziel, alle Fallen, Statistik. Exit 0 = Ziel gefunden.
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf("--" + n); return i < 0 ? d : argv.splice(i, 2)[1]; };
const flag = (n) => { const i = argv.indexOf("--" + n); return i < 0 ? false : (argv.splice(i, 1), true); };
const DEPTH = +opt("depth", 12), NODES = +opt("nodes", 5000), CONC = +opt("conc", 16), ALL = flag("all");
if (!argv[0]) { console.error("Nutzung: node explore.mjs <adapter.mjs> [--depth N] [--nodes N] [--conc N] [--all]"); process.exit(2); }

const A = await import(pathToFileURL(resolve(argv[0])).href);
const key = A.key || ((s) => JSON.stringify(s));

// Einfacher Pool, damit langsame step()-Aufrufe (Netz, Krypto, Browser) parallel laufen.
async function pool(tasks, n) {
  const out = []; let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, tasks.length) }, async () => { while (i < tasks.length) { const j = i++; out[j] = await tasks[j](); } }));
  return out;
}

const t0 = Date.now();
// Pfade als Vorgänger-Kette (Knoten = { up, a }) statt als Kopie pro Zustand: Speicher bleibt O(Zustände).
const pathOf = (n) => { const p = []; for (; n; n = n.up) p.push(n.a); return p.reverse(); };
// Ein einzelnes Set fasst in V8 höchstens 2^24 Einträge. Darüber auf mehrere Sets verteilen.
const SHARD = +process.env.EXPLORE_SHARD || 1 << 23;
const seen = { sets: [new Set()], size: 0,
  has(k) { for (const s of this.sets) if (s.has(k)) return true; return false; },
  add(k) { let s = this.sets[this.sets.length - 1]; if (s.size >= SHARD) this.sets.push(s = new Set()); s.add(k); this.size++; } };
seen.add(key(A.initial));
const goals = [], traps = new Map(), used = new Set(), tried = new Set();
let frontier = [{ state: A.initial, node: null }], calls = 0, stop = false;

for (let d = 1; d <= DEPTH && frontier.length && !stop; d++) {
  const jobs = frontier.flatMap(({ state, node }) => A.actions(state).map((a) => async () => {
    if (stop) return;
    calls++; tried.add(a);
    const r = await A.step(state, a);
    if (!r) return;
    used.add(a);
    const n = { up: node, a }, k = key(r.state);
    if (r.trap) {                                  // eine Falle pro (Aktion, Grund) melden, kürzester Pfad
      const tk = a + "\u0000" + r.trap, t = traps.get(tk);
      if (t) t.n++; else traps.set(tk, { path: pathOf(n), why: r.trap, n: 1 });
      return;
    }
    if (r.goal) { if (stop) return; goals.push({ path: pathOf(n), note: r.note }); if (!ALL) stop = true; return; }
    if (seen.has(k)) return;                       // Zyklus / schon bekannt
    seen.add(k);
    if (r.note) console.log(`d${d}  ${pathOf(n).join(" > ")}\n     ${String(r.note).slice(0, 240)}`);
    return { state: r.state, node: n };
  }));
  frontier = (await pool(jobs, CONC)).filter(Boolean);
  if (seen.size >= NODES) { console.log(`! Knotenbudget ${NODES} erreicht – Suche abgebrochen.`); break; }
}

console.log("\n== Ergebnis");
for (const g of goals) console.log("ZIEL  " + g.path.join(" > ") + (g.note ? "\n      " + g.note : ""));
if (!goals.length) console.log("kein Ziel gefunden (Tiefe " + DEPTH + "). Kandidaten erweitern oder Tiefe erhöhen.");
for (const t of traps.values()) console.log("FALLE " + t.path.join(" > ") + "  –  " + t.why + (t.n > 1 ? `  (${t.n}× erreicht)` : ""));
const dead = [...tried].filter((a) => !used.has(a));
if (dead.length) console.log("nie wirksam (Kandidaten streichen?): " + dead.join(", "));
console.log(`zustände=${seen.size} aufrufe=${calls} zeit=${Date.now() - t0}ms`);
process.exit(goals.length ? 0 : 1);
