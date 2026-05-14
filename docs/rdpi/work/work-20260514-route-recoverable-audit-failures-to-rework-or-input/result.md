# Route Recoverable Audit Failures To Rework Or Input - Result

## Outcome

Completed.

Recoverable audit validator failures now route back into local implementation rework while review budget remains, including repeated same recoverable signatures. True external blockers, operator-input waits, and terminal no-progress guards remain terminal or waiting states instead of being folded into recoverable rework.

## Implementation summary

- Added shared audit lifecycle predicates in `@aif/shared` for recoverable audit failure families and terminal audit artifact/rework outcomes.
- Replaced duplicated recoverable audit family sets in coordinator and API task-event routing with the shared predicate.
- Updated coordinator/API completion-evidence routing so recoverable audit artifact failures return to `implementing` with `reworkRequested=true` until review budget is exhausted; repeated same signatures now add diagnostics instead of immediately terminalizing.
- Changed deterministic audit report repair failure handling so strict validation failures persist structured artifact attempt details and `autoReviewState.reworkSnapshot`, then fall through to runtime implementer rework. `source_inconclusive` remains terminal.
- Extended plan-quality task context with persisted audit artifact role and roadmap batch id so source report children inside a decomposed audit batch are not re-blocked by broad audit decomposition checks.
- Added durable operator-input hold normalization: `blocked_external` with `blockedReason` prefix `operator_input_required:` forces `paused=true` and clears `retryAfter`; retry requires a newer human answer comment and clears `paused` when accepted.
- Broadened auto-queue active-count logic so terminal historical/manual audit report or synthesis artifacts do not block the queue, while true external blockers and operator holds still count as active.

## Tests and verification

Local verification passed:

- `npm.cmd test --workspace=@aif/shared -- --run src/__tests__/planQuality.test.ts`
- `npm.cmd test --workspace=@aif/data -- --run src/__tests__/index.test.ts`
- `npm.cmd test --workspace=@aif/api -- --run src/__tests__/tasks.test.ts`
- `npm.cmd test --workspace=@aif/agent -- --run src/__tests__/implementer.test.ts src/__tests__/coordinator.test.ts src/__tests__/autoQueue.test.ts src/__tests__/planChecker.test.ts`
- `npm.cmd test --workspace=@aif/runtime -- --testTimeout=20000`
- `npm.cmd run build`
- `npm.cmd run lint`
- `git diff --check`

The default root `npm.cmd test` was not used as the final runtime signal because the runtime package has a known 5000 ms timeout path; the runtime suite passed with `--testTimeout=20000`.

## Independent gates

- `PLAN PASS`: revised plan passed after adding explicit operator-input answer and pause-clearing semantics.
- `TEST PASS`: independent tester reran build, lint, diff check, targeted shared/data/API/agent tests, and runtime tests with `--testTimeout=20000`; all returned exit code 0.
- `REVIEW PASS`: independent reviewer found no blocking correctness, queue semantics, stale-instruction, or acceptance issues after the operator-input hold normalization patch.

## Memory sync

- `python "$env:USERPROFILE\.codex\tools\codex-memsync.py" --repo . --mode auto --lane work --task-id work-20260514-route-recoverable-audit-failures-to-rework-or-input --project aif-handoff --entity aif-handoff` completed local memory review artifact generation.
- Sync status: `skipped` for shared publish because there were no publishable curated documents.
- Report: `docs/memory/reports/work-20260514-route-recoverable-audit-failures-to-rework-or-input-memsync-report.md`.
