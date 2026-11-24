#!/usr/bin/env node
// Generischer Zustandsgraph-Explorer mit Budget, Deduplizierung und Fallen-Bericht.
// Zwei Modi: BFS (Standard, kürzester Pfad nach Schritten) und A* (günstigster Pfad nach Kosten,
// optional mit Heuristik für tiefe Graphen).
//
//   node explore.mjs <adapter.mjs> [--depth 12] [--nodes 5000] [--conc 16] [--all] [--mode bfs|astar]
//
// Der Adapter (ES-Modul) beschreibt das System, das du erkundest:
//   export const initial = {...};                     // Startzustand (JSON-serialisierbar)
//   export function actions(state) { return [...] }   // Kandidaten-Aktionen (Strings)
//   export async function step(state, action) {       // Eine Aktion ausprobieren
//     return null;                                     //   -> keine Wirkung
//     return { state, note, goal, trap, cost };        //   -> neuer Zustand (+ optional:
//   }                                                  //      goal=true Ziel, trap="Grund" nicht weiter,
//                                                      //      cost=Kosten des Schritts, Standard 1)
//   export function key(state) { return "..." }       // optional: Identität eines Zustands
//   export function heuristic(state) { return 0 }     // optional, nur A*: geschätzte Restkosten.
//                                                      //   Nie überschätzen, sonst ist der Pfad evtl. nicht optimal.
//
// Ausgabe: Pfad zum Ziel, alle Fallen, nie wirksame Kandidaten, Statistik.
// Exit 0 = Ziel gefunden, 1 = nicht gefunden, 2 = falscher Aufruf oder kaputter Adapter.
//
// Als Bibliothek: import { explore } from "./explore.mjs"; const r = await explore(adapter, { mode: "astar" });
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

// Einfacher Pool, damit langsame step()-Aufrufe (Netz, Krypto, Browser) parallel laufen.
async function pool(tasks, n) {
  const out = []; let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, tasks.length) }, async () => { while (i < tasks.length) { const j = i++; out[j] = await tasks[j](); } }));
  return out;
}

// Kleiner Binär-Heap (Min nach f, bei Gleichstand nach Einfügereihenfolge = stabil).
class Heap {
  constructor() { this.a = []; this.n = 0; }
  get size() { return this.a.length; }
  less(x, y) { return x.f < y.f || (x.f === y.f && x.seq < y.seq); }
  push(v) {
    v.seq = this.n++; const a = this.a; a.push(v);
    for (let i = a.length - 1; i > 0;) { const p = (i - 1) >> 1; if (!this.less(a[i], a[p])) break; [a[i], a[p]] = [a[p], a[i]]; i = p; }
  }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last;
      for (let i = 0; ;) {
        const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < a.length && this.less(a[l], a[m])) m = l;
        if (r < a.length && this.less(a[r], a[m])) m = r;
        if (m === i) break; [a[i], a[m]] = [a[m], a[i]]; i = m;
      }
    }
    return top;
  }
}

function check(A) {
  const miss = ["initial", "actions", "step"].filter((k) => A[k] === undefined);
  if (miss.length) throw new Error("Adapter unvollständig, es fehlt: " + miss.join(", "));
  if (typeof A.actions !== "function" || typeof A.step !== "function") throw new Error("actions und step müssen Funktionen sein");
}

/**
 * Durchsucht den Zustandsraum eines Adapters.
 * @returns {Promise<{goals:{path:string[],note?:string,cost:number}[], traps:{path:string[],why:string,n:number}[],
 *           dead:string[], states:number, calls:number, ms:number, budgetHit:boolean}>}
 */
export async function explore(A, { depth = 12, nodes = 5000, conc = 16, all = false, mode = "bfs", log = () => {} } = {}) {
  check(A);
  if (mode !== "bfs" && mode !== "astar") throw new Error("mode muss bfs oder astar sein");
  const key = A.key || ((s) => JSON.stringify(s));
  const h = A.heuristic || (() => 0);
  const t0 = Date.now();
  const goals = [], traps = new Map(), used = new Set(), tried = new Set();
  let calls = 0, stop = false, budgetHit = false;

  const acts = (s) => { const a = A.actions(s); if (!Array.isArray(a)) throw new Error("actions() muss ein Array liefern"); return a; };
  async function tryStep(state, a, path) {
    calls++; tried.add(a);
    const r = await A.step(state, a);
    if (!r) return null;
    used.add(a);
    const p = [...path, a];
    if (r.trap) {                                    // eine Falle pro (Aktion, Grund) melden, kürzester Pfad
      const tk = a + "\u0000" + r.trap, t = traps.get(tk);
      if (t) t.n++; else traps.set(tk, { path: p, why: r.trap, n: 1 });
      return null;
    }
    const cost = r.cost === undefined ? 1 : Number(r.cost);
    if (!(cost >= 0)) throw new Error(`cost muss eine Zahl ≥ 0 sein (Aktion ${a})`);
    return { r, p, cost };
  }

  if (mode === "bfs") {
    const seen = new Map([[key(A.initial), 0]]);
    let frontier = [{ state: A.initial, path: [], g: 0 }];
    for (let d = 1; d <= depth && frontier.length && !stop; d++) {
      const jobs = frontier.flatMap(({ state, path, g }) => acts(state).map((a) => async () => {
        if (stop) return;
        const x = await tryStep(state, a, path);
        if (!x) return;
        const { r, p, cost } = x, k = key(r.state);
        if (r.goal) {                                // parallele Treffer: ohne --all zählt nur der erste
          if (stop) return;
          goals.push({ path: p, note: r.note, cost: g + cost }); if (!all) stop = true; return;
        }
        if (seen.has(k)) return;                     // Zyklus / schon bekannt
        seen.set(k, g + cost);
        if (r.note) log(`d${d}  ${p.join(" > ")}\n     ${String(r.note).slice(0, 240)}`);
        return { state: r.state, path: p, g: g + cost };
      }));
      frontier = (await pool(jobs, conc)).filter(Boolean);
      if (seen.size >= nodes && frontier.length) { budgetHit = true; break; }
    }
    return finish(seen.size);
  }

  // A*: expandiert immer die Knoten mit kleinstem f = g + h, bis zu `conc` gleichzeitig.
  // Ein Ziel wird erst akzeptiert, wenn es selbst vorne in der Warteschlange liegt -> optimal bei zulässiger Heuristik.
  const k0 = key(A.initial);
  const best = new Map([[k0, 0]]);
  const open = new Heap();
  open.push({ state: A.initial, path: [], g: 0, f: h(A.initial), k: k0 });
  let expanded = 0;
  while (open.size && !stop) {
    const batch = [];
    while (open.size && batch.length < conc) {
      const n = open.pop();
      if (n.goal) {
        if (batch.length) { open.push(n); break; }  // erst die günstigeren Knoten fertig expandieren
        goals.push({ path: n.path, note: n.note, cost: n.g });
        if (!all) stop = true;
        break;
      }
      if (n.g > (best.get(n.k) ?? Infinity)) continue;  // veralteter Eintrag
      if (n.path.length >= depth) continue;
      batch.push(n);
    }
    if (stop || !batch.length) continue;
    if (expanded + batch.length > nodes) { budgetHit = true; break; }
    expanded += batch.length;
    const jobs = batch.flatMap(({ state, path, g }) => acts(state).map((a) => async () => {
      const x = await tryStep(state, a, path);
      if (!x) return;
      const { r, p, cost } = x, ng = g + cost;
      if (r.goal) { open.push({ path: p, note: r.note, g: ng, f: ng, goal: true }); return; }
      const k = key(r.state);
      if (ng >= (best.get(k) ?? Infinity)) return;  // schon günstiger erreicht
      best.set(k, ng);
      if (r.note) log(`g${ng}  ${p.join(" > ")}\n     ${String(r.note).slice(0, 240)}`);
      open.push({ state: r.state, path: p, g: ng, f: ng + h(r.state), k });
    }));
    await pool(jobs, conc);
  }
  return finish(best.size);

  function finish(states) {
    return {
      goals, traps: [...traps.values()], dead: [...tried].filter((a) => !used.has(a)),
      states, calls, ms: Date.now() - t0, budgetHit
    };
  }
}

// ---------- CLI ----------
async function main() {
  const argv = process.argv.slice(2);
  const opt = (n, d) => { const i = argv.indexOf("--" + n); return i < 0 ? d : argv.splice(i, 2)[1]; };
  const flag = (n) => { const i = argv.indexOf("--" + n); if (i < 0) return false; argv.splice(i, 1); return true; };
  const o = { depth: +opt("depth", 12), nodes: +opt("nodes", 5000), conc: +opt("conc", 16), mode: opt("mode", "bfs"), all: flag("all"), log: console.log };
  if (!argv[0] || [o.depth, o.nodes, o.conc].some((x) => !(x > 0))) {
    console.error("Nutzung: node explore.mjs <adapter.mjs> [--depth N] [--nodes N] [--conc N] [--all] [--mode bfs|astar]");
    process.exit(2);
  }
  let r;
  try { r = await explore(await import(pathToFileURL(resolve(argv[0])).href), o); }
  catch (e) { console.error("Fehler: " + e.message); process.exit(2); }

  console.log("\n== Ergebnis (" + o.mode + ")");
  for (const g of r.goals) console.log("ZIEL  " + g.path.join(" > ") + (o.mode === "astar" ? `  [kosten ${g.cost}]` : "") + (g.note ? "\n      " + g.note : ""));
  if (!r.goals.length) console.log("kein Ziel gefunden (Tiefe " + o.depth + "). Kandidaten erweitern oder Tiefe erhöhen.");
  for (const t of r.traps) console.log("FALLE " + t.path.join(" > ") + "  –  " + t.why + (t.n > 1 ? `  (${t.n}× erreicht)` : ""));
  if (r.dead.length) console.log("nie wirksam (Kandidaten streichen?): " + r.dead.join(", "));
  if (r.budgetHit) console.log(`! Knotenbudget ${o.nodes} erreicht – Suche abgebrochen.`);
  console.log(`zustände=${r.states} aufrufe=${r.calls} zeit=${r.ms}ms`);
  process.exit(r.goals.length ? 0 : 1);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
