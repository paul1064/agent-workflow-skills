#!/usr/bin/env node
// Prüft, ob Skills, README und Manifeste zusammenpassen.   node tools/check-skills.mjs
// Meldet jede Abweichung einzeln. Exit 0 = keine Abweichung, 1 = mindestens eine.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (p) => readFileSync(join(root, p), "utf8");
const problems = [];
const bad = (m) => problems.push(m);

const skills = readdirSync(join(root, "skills"), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
const readme = read("README.md");
for (const s of skills) {
  const file = `skills/${s}/SKILL.md`;
  if (!existsSync(join(root, file))) { bad(`${file}: fehlt`); continue; }
  const fm = /^---\n([\s\S]*?)\n---\n/.exec(read(file));
  if (!fm) { bad(`${file}: kein Frontmatter`); continue; }
  const field = (k) => new RegExp(`^${k}:\\s*(.+)$`, "m").exec(fm[1])?.[1].trim();
  if (field("name") !== s) bad(`${file}: name '${field("name")}' passt nicht zum Ordner '${s}'`);
  const d = field("description") || "";
  if (!d) bad(`${file}: description fehlt`);
  if (d.length > 1024) bad(`${file}: description hat ${d.length} Zeichen (höchstens 1024)`);
  if (!readme.includes("`" + s + "`")) bad(`README.md: Skill '${s}' steht nicht in der Tabelle`);
  for (const m of read(file).matchAll(/\$\{CLAUDE_SKILL_DIR\}\/([\w./-]+)/g))
    if (!existsSync(join(root, "skills", s, m[1]))) bad(`${file}: verweist auf fehlende Datei ${m[1]}`);
}

const WORDS = { 1: ["Ein", "One"], 2: ["Zwei", "Two"], 3: ["Drei", "Three"], 4: ["Vier", "Four"], 5: ["Fünf", "Five"], 6: ["Sechs", "Six"] }[skills.length];
let plugin, market;
try { plugin = JSON.parse(read(".claude-plugin/plugin.json")); } catch (e) { bad(".claude-plugin/plugin.json: kein gültiges JSON"); }
try { market = JSON.parse(read(".claude-plugin/marketplace.json")); } catch (e) { bad(".claude-plugin/marketplace.json: kein gültiges JSON"); }
if (plugin && !/^\d+\.\d+\.\d+$/.test(plugin.version)) bad(`plugin.json: version '${plugin.version}' ist nicht x.y.z`);
if (WORDS) {
  if (!readme.includes(WORDS[0] + " Skills")) bad(`README.md: Anzahl im Einleitungssatz passt nicht zu ${skills.length} Skills`);
  if (plugin && !plugin.description.startsWith(WORDS[1] + " skills")) bad(`plugin.json: description nennt nicht '${WORDS[1]} skills'`);
}
for (const p of market?.plugins || []) if (p.name !== plugin?.name) bad(`marketplace.json: Plugin '${p.name}' passt nicht zu plugin.json '${plugin?.name}'`);

for (const p of problems) console.log("ABWEICHUNG  " + p);
console.log(`skills=${skills.length} (${skills.join(", ")})  abweichungen=${problems.length}`);
process.exit(problems.length ? 1 : 0);
