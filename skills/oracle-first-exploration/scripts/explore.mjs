#!/usr/bin/env node
// Generischer Zustandsgraph-Explorer (BFS) mit Budget, Deduplizierung, Fallen-Bericht
// und Wiederaufnahme: ein Lauf, der abbricht, verliert seine Arbeit nicht.
//
//   node explore.mjs <adapter.mjs> [--depth 12] [--nodes 5000] [--conc 16] [--all]
//                                  [--checkpoint datei] [--checkpoint-every 60]
//                                  [--retries 2] [--backoff 200] [--max-fail 20]
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
// Ausgabe: erster (kürzester) Pfad zum Ziel, alle Fallen, Statistik.
// Exit 0 = Ziel gefunden, 1 = kein Ziel (Suche vollständig oder Tiefe/Budget erreicht),
//      2 = falscher Aufruf, 3 = unvollständig (abgebrochen oder Schritte fehlgeschlagen).
//
// Robustheit:
//   - step() wirft: --retries Wiederholungen mit wachsender Pause (--backoff ms). Danach gilt der
//     Schritt als fehlgeschlagen, wird gemeldet und gemerkt; die Suche läuft weiter.
//   - --max-fail Fehler in Folge: das System gilt als nicht erreichbar, die Suche hält an.
//   - Strg+C, SIGTERM, fast voller Speicher: laufende Schritte enden, dann Bericht und Exit 3.
//   - --checkpoint datei: sichert den Stand alle --checkpoint-every Sekunden und bei jedem Halt.
//     Derselbe Aufruf setzt dort fort und holt fehlgeschlagene Schritte zuerst nach.
//     Jede Sicherung trägt eine Prüfsumme; ist sie beschädigt, gilt die vorige (datei.bak).
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { StringDecoder } from "node:string_decoder";
import fs from "node:fs";
import v8 from "node:v8";

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf("--" + n); return i < 0 ? d : argv.splice(i, 2)[1]; };
const flag = (n) => { const i = argv.indexOf("--" + n); return i < 0 ? false : (argv.splice(i, 1), true); };
const DEPTH = +opt("depth", 12), NODES = +opt("nodes", 5000), CONC = Math.max(1, +opt("conc", 16)), ALL = flag("all");
const CKPT = opt("checkpoint", null), EVERY = +opt("checkpoint-every", 60) * 1000;
const RETRIES = +opt("retries", 2), BACKOFF = +opt("backoff", 200), MAXFAIL = +opt("max-fail", 20);
if (!argv[0]) { console.error("Nutzung: node explore.mjs <adapter.mjs> [--depth N] [--nodes N] [--conc N] [--all] [--checkpoint datei]"); process.exit(2); }

const adapterPath = resolve(argv[0]);
const A = await import(pathToFileURL(adapterPath).href);
const key = A.key || ((s) => JSON.stringify(s));
const ADAPTER_ID = createHash("sha256").update(fs.readFileSync(adapterPath)).digest("hex").slice(0, 16);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Pfade als Vorgänger-Kette (Knoten = { up, a }) statt als Kopie pro Zustand: Speicher bleibt O(Zustände).
const pathOf = (n) => { const p = []; for (; n; n = n.up) p.push(n.a); return p.reverse(); };
// Ein einzelnes Set fasst in V8 höchstens 2^24 Einträge. Darüber auf mehrere Sets verteilen.
// Bei kleinem Heap sind die Teil-Sets kleiner: ein Set verdoppelt beim Wachsen seine Tabelle in
// einem Stück, und dieses Stück muss noch in den freien Speicher passen.
const HEAP_LIMIT = v8.getHeapStatistics().heap_size_limit;
// Speicherwächter: V8 zählt rund 48 MB für kurzlebige Objekte zum Limit, die für Zustände nicht
// nutzbar sind (Faustwert, gemessen mit Node 22). Vom Rest bleiben 15 % frei – genug, um noch zu sichern.
const YOUNG = 48 << 20, OLD_LIMIT = Math.max(HEAP_LIMIT - YOUNG, 16 << 20);
const HEAP_RESERVE = YOUNG + Math.max(0.15 * OLD_LIMIT, 12 << 20);
const SHARD = +process.env.EXPLORE_SHARD || Math.min(1 << 23, Math.max(1 << 14, Math.floor(HEAP_LIMIT / 512)));
const seen = { sets: [new Set()], size: 0,
  has(k) { for (const s of this.sets) if (s.has(k)) return true; return false; },
  add(k) { let s = this.sets[this.sets.length - 1]; if (s.size >= SHARD) this.sets.push(s = new Set()); s.add(k); this.size++; } };

// --- Suchzustand. Alles hier steht im Checkpoint. -------------------------------------------
const t0 = Date.now();
let depth = 1, calls = 0, seq = 0, exhausted = false, gaps = false;
let level = [{ state: A.initial, node: null }];   // Einträge der aktuellen Tiefe: { state, node, acts? }
let next = [];                                    // Funde für die nächste Tiefe: { state, node, seq }
let failed = [];                                  // Schritte, die auch nach Wiederholung scheiterten
const goals = [], traps = new Map(), errors = new Map(), used = new Set(), tried = new Set();
seen.add(key(A.initial));

// --- Laufsteuerung --------------------------------------------------------------------------
let stop = false;          // Ziel gefunden (ohne --all)
let halt = null;           // Grund für einen vorzeitigen Halt (Signal, Speicher, System weg, Fehler)
let pause = false;         // kurz anhalten, um zu sichern
let failRun = 0, needSort = false, lastSeq = -1, lastGuard = 0, sinceGuard = 0, nextCkptAt = Date.now() + EVERY;
let li = 0, cur = null, ai = 0;                   // Lesezeiger in level

// Nächster Schritt der aktuellen Tiefe. Aktionen eines Eintrags entstehen erst, wenn er dran ist.
function nextJob() {
  for (;;) {
    if (!cur) {
      if (li >= level.length) return null;
      const e = level[li];
      cur = { e, acts: e.acts || A.actions(e.state) };
      ai = 0;
    }
    if (ai < cur.acts.length) return { state: cur.e.state, node: cur.e.node, a: cur.acts[ai++], seq: seq++ };
    level[li++] = null; cur = null;
  }
}
// Was von der aktuellen Tiefe noch offen ist (für den Checkpoint).
function* pending() {
  if (cur && ai < cur.acts.length) yield { state: cur.e.state, node: cur.e.node, acts: cur.acts.slice(ai) };
  for (let i = li + (cur ? 1 : 0); i < level.length; i++) yield level[i];
}

function guard() {
  const now = Date.now();
  if (now - lastGuard < Math.min(250, EVERY) && ++sinceGuard < 2048) return false;
  const tick = now - lastGuard >= Math.min(250, EVERY);
  lastGuard = now; sinceGuard = 0;
  if (CKPT && now >= nextCkptAt) pause = true;
  const h = v8.getHeapStatistics();
  if (h.total_available_size < HEAP_RESERVE)
    halt = `Speicher fast voll (${h.used_heap_size >> 20} MB belegt, ${OLD_LIMIT >> 20} MB nutzbar). Mit node --max-old-space-size=<MB> und mehr Speicher fortsetzen`;
  return tick;
}

function fail(j, e) {
  const msg = String(e?.message ?? e).split("\n")[0].slice(0, 200);
  failed.push({ state: j.state, node: j.node, a: j.a });
  gaps = true;
  const k = j.a + "\u0000" + msg, x = errors.get(k);
  if (x) x.n++; else errors.set(k, { path: pathOf({ up: j.node, a: j.a }), why: msg, n: 1 });
  if (++failRun >= MAXFAIL && !halt) halt = `System antwortet nicht (${failRun} Fehler in Folge)`;
}

async function runJob(j) {
  calls++; tried.add(j.a);
  let r;
  for (let t = 0; ; t++) {
    try { r = await A.step(j.state, j.a); break; }
    catch (e) {
      if (t >= RETRIES || halt) return fail(j, e);
      await sleep(BACKOFF * 2 ** t);
    }
  }
  failRun = 0;
  if (!r) return;
  used.add(j.a);
  const n = { up: j.node, a: j.a }, k = key(r.state);
  if (r.trap) {                                    // eine Falle pro (Aktion, Grund) melden, kürzester Pfad
    const tk = j.a + "\u0000" + r.trap, t = traps.get(tk);
    if (t) t.n++; else traps.set(tk, { path: pathOf(n), why: r.trap, n: 1 });
    return;
  }
  if (r.goal) { goals.push({ path: pathOf(n), note: r.note }); if (!ALL) stop = true; return; }
  if (seen.has(k)) return;                         // Zyklus / schon bekannt
  seen.add(k);
  if (r.note) console.log(`d${depth}  ${pathOf(n).join(" > ")}\n     ${String(r.note).slice(0, 240)}`);
  if (j.seq < lastSeq) needSort = true; else lastSeq = j.seq;
  next.push({ state: r.state, node: n, seq: j.seq });
}

// Arbeitet eine Quelle mit CONC parallelen Läufern ab. Kehrt erst zurück, wenn kein Schritt mehr
// unterwegs ist: danach ist der Suchzustand in sich stimmig und darf gesichert werden.
// Ein Fehler außerhalb von step() (actions, key, intern) hält die Suche an, statt sie abzuschießen.
async function drain(source) {
  const worker = async () => {
    for (;;) {
      if (stop || halt || pause) return;
      let j = null;
      try {
        // Antwortet step() ohne echte Wartezeit, käme die Ereignisschleife nie an die Reihe und
        // Signale blieben liegen. Deshalb regelmäßig kurz Platz machen.
        if (guard()) await new Promise(setImmediate);
        if (stop || halt || pause || !(j = source())) return;
        await runJob(j);
      } catch (e) {
        if (j) fail(j, e);
        if (!halt) halt = "Fehler im Adapter: " + String(e?.message ?? e).split("\n")[0].slice(0, 200);
        return;
      }
    }
  };
  await Promise.all(Array.from({ length: CONC }, worker));
}

// --- Checkpoint: schreiben ------------------------------------------------------------------
// Zeilenweise JSON. Die letzte Zeile nennt Zeilenzahl und SHA-256 aller Zeilen davor; fehlt sie
// oder stimmt sie nicht, ist die Datei unvollständig. Geschrieben wird in datei.tmp, dann wird
// umbenannt, die vorige Sicherung bleibt als datei.bak liegen. So gibt es zu jedem Zeitpunkt
// mindestens eine vollständige Sicherung.
function saveCheckpoint() {
  const started = Date.now(), tmp = CKPT + ".tmp", fd = fs.openSync(tmp, "w"), sha = createHash("sha256");
  let buf = [], len = 0, lines = 0;
  const flush = () => { if (buf.length) fs.writeSync(fd, buf.join("")); buf = []; len = 0; };
  const put = (tag, v) => { const s = JSON.stringify([tag, v]) + "\n"; sha.update(s); buf.push(s); lines++; if ((len += s.length) > 1 << 20) flush(); };
  const chunks = (tag, it, size) => { let c = []; for (const x of it) { c.push(x); if (c.length >= size) { put(tag, c); c = []; } } if (c.length) put(tag, c); };

  put("H", { v: 1, adapter: ADAPTER_ID, depth, calls, seq, exhausted, gaps, used: [...used], tried: [...tried] });
  chunks("K", (function* () { for (const s of seen.sets) yield* s; })(), 5000);

  // Knoten bekommen Nummern; Eltern stehen in der Datei immer vor ihren Kindern.
  const ids = new Map(); let nid = 0, nodes = [];
  const idOf = (n) => {
    const chain = [];
    for (; n && !ids.has(n); n = n.up) chain.push(n);
    let up = n ? ids.get(n) : 0;
    while (chain.length) { const x = chain.pop(); ids.set(x, ++nid); nodes.push([nid, up, x.a]); up = nid; }
    if (nodes.length >= 5000) { put("N", nodes); nodes = []; }
    return up;
  };
  const entries = (tag, it, row) => {
    let c = [];
    const out = () => { if (nodes.length) { put("N", nodes); nodes = []; } if (c.length) put(tag, c); c = []; };
    for (const e of it) { c.push(row(e, idOf(e.node))); if (c.length >= 2000) out(); }
    out();
  };
  entries("L", pending(), (e, id) => [e.state, id, e.acts || 0]);
  entries("X", next, (e, id) => [e.state, id, e.seq]);
  entries("F", failed, (e, id) => [e.state, id, e.a]);
  put("G", goals); put("T", [...traps]); put("E", [...errors]);
  flush();
  fs.writeSync(fd, JSON.stringify(["Z", { lines, sha: sha.digest("hex") }]) + "\n");
  fs.fsyncSync(fd); fs.closeSync(fd);
  if (fs.existsSync(CKPT)) fs.renameSync(CKPT, CKPT + ".bak");
  fs.renameSync(tmp, CKPT);
  // Sichern soll höchstens rund ein Zehntel der Laufzeit kosten: große Stände seltener sichern.
  nextCkptAt = Date.now() + Math.max(EVERY, 10 * (Date.now() - started));
}

// --- Checkpoint: lesen ----------------------------------------------------------------------
function* readLines(file) {
  const fd = fs.openSync(file, "r"), chunk = Buffer.alloc(1 << 20), dec = new StringDecoder("utf8");
  let rest = "";
  try {
    for (let n; (n = fs.readSync(fd, chunk, 0, chunk.length, null)) > 0;) {
      const parts = (rest + dec.write(chunk.subarray(0, n))).split("\n");
      rest = parts.pop();
      yield* parts;
    }
    if (rest) yield rest;
  } finally { fs.closeSync(fd); }
}

// Liest eine Sicherung vollständig in eigene Strukturen und prüft sie. Erst danach wird sie übernommen.
function loadCheckpoint(file) {
  const sha = createHash("sha256"), c = { keys: [], nodes: [null], L: [], X: [], F: [], G: [], T: [], E: [], H: null };
  let lines = 0, end = null;
  for (const line of readLines(file)) {
    if (end) throw new Error("Daten nach der Schlusszeile");
    let tag, v;
    try { [tag, v] = JSON.parse(line); } catch { throw new Error("Zeile " + (lines + 1) + " ist kein JSON"); }
    if (tag === "Z") { end = v; continue; }
    sha.update(line + "\n"); lines++;
    if (tag === "H") c.H = v;
    else if (tag === "K") c.keys.push(v);
    else if (tag === "N") for (const [id, up, a] of v) c.nodes[id] = { up: c.nodes[up] || null, a };
    else if (tag === "L") for (const [state, id, acts] of v) c.L.push(acts ? { state, node: c.nodes[id] || null, acts } : { state, node: c.nodes[id] || null });
    else if (tag === "X") for (const [state, id, s] of v) c.X.push({ state, node: c.nodes[id] || null, seq: s });
    else if (tag === "F") for (const [state, id, a] of v) c.F.push({ state, node: c.nodes[id] || null, a });
    else if (tag === "G" || tag === "T" || tag === "E") c[tag] = v;
  }
  if (!end) throw new Error("Schlusszeile fehlt – Datei unvollständig");
  if (end.lines !== lines || end.sha !== sha.digest("hex")) throw new Error("Prüfsumme stimmt nicht");
  if (!c.H || c.H.v !== 1) throw new Error("unbekanntes Format");
  if (c.H.adapter !== ADAPTER_ID) throw Object.assign(new Error("gehört zu einem anderen oder geänderten Adapter"), { fatal: true });
  return c;
}

function restore(c) {
  ({ depth, calls, seq, exhausted, gaps } = c.H);
  seen.sets = [new Set()]; seen.size = 0;
  for (const ks of c.keys) for (const k of ks) seen.add(k);
  level = c.L; next = c.X; failed = c.F; li = 0; cur = null;
  lastSeq = next.length ? next[next.length - 1].seq : -1;
  goals.push(...c.G);
  for (const [k, v] of c.T) traps.set(k, v);
  for (const [k, v] of c.E) errors.set(k, v);
  for (const a of c.H.used) used.add(a);
  for (const a of c.H.tried) tried.add(a);
}

// --- Start: Stand laden, Signale ------------------------------------------------------------
if (CKPT) {
  let loaded = false;
  for (const f of [CKPT, CKPT + ".bak"]) {
    if (!fs.existsSync(f)) continue;
    try {
      restore(loadCheckpoint(f));
      console.log(`~ Stand geladen aus ${f}: tiefe=${depth} zustände=${seen.size} aufrufe=${calls}` + (failed.length ? ` nachzuholen=${failed.length}` : ""));
      loaded = true;
      break;
    } catch (e) {
      if (e.fatal) { console.error(`Checkpoint ${f} ${e.message}. Datei löschen oder anderen Pfad angeben.`); process.exit(2); }
      console.log(`! Checkpoint ${f} unbrauchbar (${e.message}).`);
    }
  }
  if (!loaded && (fs.existsSync(CKPT) || fs.existsSync(CKPT + ".bak"))) console.log("! Keine brauchbare Sicherung – Suche beginnt von vorn.");
}
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => { if (halt) process.exit(130); halt = "Signal " + sig; });

// --- Suche ----------------------------------------------------------------------------------
const done = () => goals.length && !ALL;
try {
  // Wiederherstellung: Schritte, die im vorigen Lauf scheiterten, kommen zuerst noch einmal dran.
  if (failed.length && !done()) {
    const retry = failed; failed = []; errors.clear();
    let i = 0;
    do { pause = false; await drain(() => (i < retry.length ? { ...retry[i++], seq: seq++ } : null)); } while (pause && !halt && !stop);
    failed.push(...retry.slice(i));                // bei einem Halt: der Rest bleibt gemerkt
    if (next.length) exhausted = false;            // nachgeholte Schritte haben neue Zustände geöffnet
  }
  while (!done() && !halt && !exhausted && depth <= DEPTH) {
    await drain(nextJob);
    if (pause && !stop && !halt) { pause = false; saveCheckpoint(); continue; }
    if (stop || halt) break;
    if (needSort) { next.sort((a, b) => a.seq - b.seq); needSort = false; }
    level = next; next = []; li = 0; cur = null; depth++; seq = 0; lastSeq = -1;
    if (!level.length) { exhausted = true; break; }
    if (seen.size >= NODES) { console.log(`! Knotenbudget ${NODES} erreicht – Suche abgebrochen.`); break; }
  }
} catch (e) {
  halt = "interner Fehler: " + String(e?.message ?? e).split("\n")[0];
}

let saved = false;
if (CKPT) { try { saveCheckpoint(); saved = true; } catch (e) { console.log("! Sichern fehlgeschlagen: " + e.message); } }

// --- Bericht --------------------------------------------------------------------------------
console.log("\n== Ergebnis");
for (const g of ALL ? goals : goals.slice(0, 1)) console.log("ZIEL  " + g.path.join(" > ") + (g.note ? "\n      " + g.note : ""));
if (goals.length && gaps) console.log("      Hinweis: Es gab fehlgeschlagene Schritte. Der Pfad stimmt, ist aber womöglich nicht der kürzeste.");
if (!goals.length) console.log(exhausted && !failed.length ? "kein Ziel gefunden: alle erreichbaren Zustände durchsucht." : halt || failed.length ? "kein Ziel gefunden, Suche unvollständig." : "kein Ziel gefunden (Tiefe " + DEPTH + "). Kandidaten erweitern oder Tiefe erhöhen.");
for (const t of traps.values()) console.log("FALLE " + t.path.join(" > ") + "  –  " + t.why + (t.n > 1 ? `  (${t.n}× erreicht)` : ""));
for (const e of errors.values()) console.log("FEHLER " + e.path.join(" > ") + "  –  " + e.why + (e.n > 1 ? `  (${e.n}×)` : ""));
const dead = [...tried].filter((a) => !used.has(a));
if (dead.length) console.log("nie wirksam (Kandidaten streichen?): " + dead.join(", "));
if (halt) console.log("ABBRUCH: " + halt + ".");
if (failed.length) console.log(`unvollständig: ${failed.length} Schritt(e) fehlgeschlagen.` + (CKPT ? "" : " Mit --checkpoint <datei> lassen sie sich im nächsten Lauf nachholen."));
if (saved && !done() && (halt || failed.length || !exhausted)) console.log(`Stand gesichert in ${CKPT}. Derselbe Aufruf setzt dort fort.`);
console.log(`zustände=${seen.size} aufrufe=${calls} zeit=${Date.now() - t0}ms`);
process.exit(goals.length ? 0 : halt || failed.length ? 3 : 1);
