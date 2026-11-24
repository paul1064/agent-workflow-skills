<!-- English reading version. Claude loads SKILL.md (German); keep both in sync. -->
# Goal-Signal-Check

Three stations, a few seconds each. Built from concrete mistakes, not theory.

## 1. Before starting

- **Goal in one sentence, in the user's words.** Does the chosen skill/workflow fit *this* sentence, or only the keyword? (Real mistake: a "make a skill from this project" generator was started although the user wanted lessons about their own working style. Result: an unwanted change to the repo.)
- **Clarify write permissions.** May I change things, or only read? When in doubt: read only, keep working files in a separate scratch directory. **Report** errors you find, don't fix them unasked.
- **Define the success signal before acting.** An observable state (flag, exit code, counter, file exists, test green), not "the output sounds right".
- **Set a budget.** How many attempts/minutes before I switch strategy instead of pushing on?

## 2. While working

- **Decoy test:** Did the last step move the success signal, or just produce plausible text? Hints can mislead on purpose; the source (code, data) beats the description.
- **Dead-end test:** Before investing in a long branch: what does it deliver at the end? Abort loops with a huge `n`, "back to the start", "nothing behind it" right away.
- **Third repetition = build a tool.** Whoever does the same manual action a third time builds a script/oracle (see `oracle-first-exploration`).
- **Record irreversible early decisions.** Note answers to early questions (role, captcha, mode) and snapshot state before such forks, so you can jump back instead of starting over.
- **User interrupts = stop and re-ask:** Stop immediately, undo your own changes, name the misunderstanding in one sentence, continue on the corrected goal.

## 3. Before "done"

- **Verify in the real system**, not only in the model/simulator/test. One run, read the real signal. With the verify script as a single line:
  ```bash
  node "${CLAUDE_SKILL_DIR}/scripts/verify.mjs" --cmd "npm test" --stdout "\b0 failed" --not-stdout "TODO" --git-allow "src/**"
  ```
  Checks the exit code, required and forbidden patterns in the output, files (`--file`) and that only allowed paths changed (`--git-allow`, `--git-clean`). Exit 0 = green, 1 = not done.
- **Check the diff:** Did I change something I shouldn't have? (`git status` must match the agreement.)
- **Report honestly:** What is verified, what is only assumed, what was skipped.
- **For public results** (skills, posts, repos): no personal data, no keys, no spoilers or third-party internals.
