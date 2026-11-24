# agent-workflow-skills

Two Claude Code skills that make agentic work faster and safer. Built from real runs against an encrypted web puzzle, not from theory.

*Deutsch: [README.de.md](README.de.md)*

| Skill | Use it for | Core idea |
|---|---|---|
| `oracle-first-exploration` | Exploring slow or opaque systems (UI, API, puzzles, config mazes) | Rebuild the decision logic as a fast headless oracle, search it with BFS or A*, verify the result once in the real system. Ships `explore.mjs` (Node ≥ 18, zero dependencies). |
| `goal-signal-check` | Any multi-step task | Checklist: clarify goal and write permissions, define a measurable success signal, spot decoys and dead ends, verify before "done". Ships `verify.mjs`, a success-signal checker. |

The skills are written in German; English versions for reading are next to them (`SKILL.en.md`). Trigger keywords work in both languages.

## Install

```bash
claude plugin marketplace add paul1064/agent-workflow-skills
```

```bash
claude plugin install agent-workflow-skills@agent-workflow-skills
```

Claude then loads the skills automatically when a task fits, or directly via `/agent-workflow-skills:oracle-first-exploration` and `/agent-workflow-skills:goal-signal-check`.

## Try the explorer

```bash
node skills/oracle-first-exploration/scripts/explore.mjs skills/oracle-first-exploration/examples/toy-adapter.mjs
```

Output: shortest path to the goal, traps found (each once, with a hit count), candidates that never had an effect, stats. Exit code 0 = goal found, 1 = not found, 2 = bad call or broken adapter.

More examples in `skills/oracle-first-exploration/examples/`:

| Adapter | Shows |
|---|---|
| `toy-adapter.mjs` | Puzzle vault with a trap and a decoy |
| `api-adapter.mjs` | REST flow (login → cart → pay), rate limit and cart reset as traps |
| `config-adapter.mjs` | Smallest set of flags that makes a build pass, schema conflicts as traps |
| `game-adapter.mjs` | Maze with step costs and a heuristic, for A* mode |

```bash
node skills/oracle-first-exploration/scripts/explore.mjs skills/oracle-first-exploration/examples/game-adapter.mjs --mode astar --depth 20
```

BFS finds the path with the fewest steps (9, straight through the swamp). A* finds the cheapest one (cost 15 instead of 21).

### Write your own adapter

An ES module exporting:

```js
export const initial = { /* start state */ };
export function actions(state) { return ["a", "b"]; }        // candidate actions
export async function step(state, action) {                 // try one action
  return null;                                              // no effect
  return { state, note, goal: true, trap: "why", cost: 1 }; // new state, all extras optional
}
export function key(state) { return "..."; }                // optional: state identity
export function heuristic(state) { return 0; }              // optional, A* only: remaining cost, never overestimate
```

Use it as a library too:

```js
import { explore } from "./skills/oracle-first-exploration/scripts/explore.mjs";
const { goals, traps, dead, budgetHit } = await explore(adapter, { mode: "astar", depth: 30 });
```

Options: `--depth` (default 12), `--nodes` (state budget, default 5000), `--conc` (parallel `step` calls, default 16), `--all` (every goal, not just the first), `--mode bfs|astar`.

## Check the success signal

```bash
node skills/goal-signal-check/scripts/verify.mjs --cmd "npm test" --stdout "fail 0" --not-stdout "TODO" --git-allow "src/**"
```

Green only if the exit code, the output and the set of changed files all match what was agreed. Also: `--file PATH` (must exist), `--git-clean`, `--exit N`, `--timeout SEC`. Exit 0 = green, 1 = not done, 2 = bad call.

## Tests

```bash
npm test
```

Zero dependencies (`node --test`). Covers the edge cases of `explore.mjs` (cycles, traps, budget, depth limit, concurrency, A* optimality, CLI exit codes) and `verify.mjs`.

## Measured

On a web puzzle with an encrypted vault (~200 entries, PBKDF2) and state chains:

- One attempt in the browser: ~10 s. In the headless oracle: ~0.1 s, in parallel.
- 4⁴ path maze: 0.3 s instead of up to 256 manual tries.
- 9-step path to the hidden final level: 1.4 s with the generic explorer.
- Detected: one decoy (a hint leads to readable plaintext with no effect) and a loop of 10¹⁵ rounds with no reward.

## Note

Only use on systems you are allowed to test: your own projects, CTFs, approved test environments.

## License

MIT
