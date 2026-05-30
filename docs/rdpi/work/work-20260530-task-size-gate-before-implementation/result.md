# Result

## Outcome

Implemented a deterministic task-size split gate before implementation.

The gate now rejects broad, vague, or multi-area executable implementation cards with `task_size_split_required` and an operator-facing message beginning with `split_required:`. The rejection names concrete dimensions such as broad or missing file boundaries, changed file groups, major subsystems, setup/runtime verification surface, and broad scaffold language.

## Changes

- Added `task_size_split_required` to shared plan-quality validation in `packages/shared/src/planQuality.ts`.
- Added manifest-backed size checks for executable intents while preserving audit and spike validation paths.
- Added text-only no-manifest size screening for broad fast/pre-rollout executable plans.
- Added pre-implementation evidence integration in `packages/shared/src/taskCompletionEvidence.ts` so manual implementation starts and coordinator auto-start fail closed before implementer runtime.
- Updated planner and plan-checker guidance to preserve split-required feedback instead of turning broad implementation cards into runnable plans.
- Added a plan-checker pre-model size-only guard so broad no-manifest checklist and plain-bullet plans fail before `executeSubagentQuery`.
- Added regression coverage for shared validation, pre-implementation evidence, plan-checker, manual API start, coordinator auto-start, explicit `general` roadmap children, and focused fast-plan false positives.

## Gate History

- `PLAN PASS`: independent plan review passed after threshold and predicate details were added to `design.md` and `plan.md`.
- First final review returned `REVIEW FAIL`: no-manifest broad fast/pre-rollout plans could bypass because pre-implementation evidence only ran full plan quality for full-mode or manifest-bearing plans. Fixed by running pre-implementation plan quality for all tasks and surfacing only `task_size_split_required` for fast no-manifest plans.
- Second final review returned `REVIEW FAIL`: plan-checker could send broad no-manifest plain-bullet plans to the model before deterministic size screening. Fixed by adding the pre-model size-only guard and a plain-bullet regression.
- Final independent test gate returned `TEST PASS`.
- Final independent review gate returned `REVIEW PASS`.

## Verification

Independent tester ran:

- `npm.cmd run format:check` - pass.
- `npm.cmd run lint` - pass with one unrelated warning in `packages/agent/src/subagents/reviewer.ts` for unused `runRequiredSpecializedReviewers`.
- `npm.cmd test --workspace=@aif/shared -- --run src/__tests__/planQuality.test.ts src/__tests__/taskCompletionEvidence.test.ts` - pass, 208 tests.
- `npm.cmd test --workspace=@aif/agent -- --run src/__tests__/planChecker.test.ts src/__tests__/coordinator.test.ts` - pass.
- `npm.cmd test --workspace=@aif/api -- --run src/__tests__/tasks.test.ts` - pass.
- `npm.cmd test` - pass.
- `npm.cmd run build` - pass, 7 build tasks.

Independent reviewer also reran focused shared, agent, API tests plus build and lint, and returned `REVIEW PASS`.

## Memory Sync

`python "$env:USERPROFILE\.codex\tools\codex-memsync.py" --repo . --mode auto --lane work --task-id work-20260530-task-size-gate-before-implementation --project aif-handoff --entity aif-handoff` completed the local memory-review phase.

Status: `skipped` for publish, because there were no publishable curated documents.

Generated artifacts:

- `docs/memory/tasks/work/work-20260530-task-size-gate-before-implementation-delta.md`
- `docs/memory/reports/work-20260530-task-size-gate-before-implementation-memsync-report.md`

## Notes

- The repository was already dirty before this task. Unrelated pre-existing changes remain untouched, including other `docs/memory/**`, `docs/intake/**`, and unrelated coordinator/runtime edits.
- This task did not implement automatic split-child execution; it only blocks oversized executable cards and tells the operator to split them.
