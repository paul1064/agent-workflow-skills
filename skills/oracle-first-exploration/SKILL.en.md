<!-- English reading version. Claude loads SKILL.md (German); keep both in sync. -->
# Oracle-first Exploration

Don't brute-force a slow or opaque system (web UI, API, puzzle, game, config maze, build) by hand. Rebuild its decision logic as a fast headless oracle, search the state space (traps, decoys and dead ends are reported automatically), then verify the result **once** in the real system.

Measured on a real web puzzle (encrypted vault, ~200 entries, state chains):

| Approach | Cost per attempt | Result |
|---|---|---|
| Clicking in the browser | ~10 s | slow, error-prone |
| Headless oracle | ~0.1 s, parallel | 4⁴ maze in 0.3 s, 9-step path in 1.4 s |

## Workflow

1. **Read the truth, not the surface.** Source code, network responses, config, logs. Comments and "dead" code are often the real rules. UI hints are lossy and may point at a decoy on purpose.
2. **Extract the oracle.** Rebuild the smallest function that answers *input → effect* (validation, decryption, state transition, endpoint). Read-only; the original stays untouched.
3. **Calibrate the oracle.** Send 2–3 known inputs through the oracle *and* the real system. Any mismatch means the oracle is wrong: stop searching.
4. **Write an adapter** (`initial`, `actions`, `step`, optional `key`, `heuristic`). Templates in `${CLAUDE_SKILL_DIR}/examples/`:
   - `toy-adapter.mjs` – puzzle vault with a trap and a decoy
   - `api-adapter.mjs` – REST flow (login → cart → pay), rate limit as a trap
   - `config-adapter.mjs` – smallest flag combination for a passing build
   - `game-adapter.mjs` – maze with costs (swamp) and a heuristic, for `--mode astar`
5. **Search:**
   ```bash
   node "${CLAUDE_SKILL_DIR}/scripts/explore.mjs" my-adapter.mjs --depth 12 --nodes 5000
   ```
   Output: shortest path to the goal, traps (each once, with a count), candidates that never had an effect, stats. Exit 0 = goal found.
   - **Steps have different costs** (time, money, API quota) or the graph is deep: `--mode astar`. `step` returns `cost`, the adapter optionally exports `heuristic(state)` (estimated remaining cost, never overestimate). Result: cheapest instead of shortest path, usually with fewer calls.
   - As a library: `import { explore } from ".../explore.mjs"` returns `{ goals, traps, dead, states, calls, budgetHit }`.
6. **Verify in the real system.** Run the found path exactly once for real and check the *real* success signal (see skill `goal-signal-check`).

## Adapter rules

- `step` returns `null` when an action has no effect. Saves nodes and reports dead candidates.
- Mark traps explicitly with `trap: "reason"`: loops with a huge `n`, "back to start", actions with no reward. Read **what** a branch delivers at the end before investing time in it.
- Set `goal` only on a hard signal (flag set, status 200 with content X, level value), never on "the text sounds like progress".
- Early decisions (captcha, role, mode) belong in the **state**. They can reappear 20 steps later as a precondition.
- `key(state)` must include everything that affects behavior, or deduplication swallows real paths.

## Finding candidates

The search is only as good as `actions()`. Sources, in this order:
1. Words the system offers itself (menus, "up | down", error messages, regexes in responses).
2. Verbs and nouns from hint texts, in variants (infinitive, imperative, with/without object).
3. Cultural patterns: does a hint chain look like a known trick (a game glitch, a code sequence, a cipher)? Borrow its vocabulary.
More candidates only cost compute; missing ones cost the find.

## Gotchas

- **Plausible output is not success.** Decrypting with the "almost right" key produced readable plaintext, but no seal. Only the variant with special characters (umlaut as *one* character) counted. Always check the effect signal.
- **Dead ends look like progress.** One branch offered a loop of 10¹⁵ rounds and rewarded you with "nothing". Before working through it: read loop size and reward.
- **Oracle ≠ truth.** Normalization differences (case, Unicode NFC, umlauts, whitespace) are the most common source of error. Hence steps 3 and 6.
- Parallelize expensive `step` functions (crypto, network) with `--conc`; mind the real system's rate limits. The oracle should run locally.
- Only use on systems you are allowed to test (own projects, CTFs, approved tests).
