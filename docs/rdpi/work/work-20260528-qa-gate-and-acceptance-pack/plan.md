# Plan

## Task

work-20260528-qa-gate-and-acceptance-pack

## Status

Plan ready for independent review on 2026-05-29. Implementation must not start until `PLAN PASS`.

## Steps

1. Shared contracts
   - Add `qa` to `TASK_STATUSES`, `COORDINATOR_STAGES`, `STATUS_CONFIG`, `ORDERED_STATUSES`, runtime stages/profile mapping, workflow artifact kinds, and state-machine human actions.
   - Add `AIF_REQUIREMENTS_QA_ENABLED` to env parsing with default false and tests.
   - Add `TaskQaMandatoryCheck`, `TaskQaCommandEvidence`, `TaskQaSkippedCheck`, `TaskQaSourceFingerprint`, and `TaskAcceptancePack` types and expose `acceptancePack` on `Task`.

2. Data/read model
   - Add `qa` to active child, requirement resume, coordinator candidate, active pipeline count, project queue `executionActiveCount`, branch-bound active-task, stale-claim cleanup, and stale in-progress watchdog status sets.
   - Add helpers to build a deterministic mandatory-check inventory from implementation manifest verification evidence and plan-manifest requirements.
   - Add helpers to compute the current QA source fingerprint from requirements snapshot/waiver id, normalized implementation manifest hash, changed-files digest, review comments hash, review iteration count, skip-review flag, auto-review state digest, plan manifest hash, and mandatory inventory hash.
   - Add helpers to locate accepted QA/acceptance artifacts only when their metadata fingerprint matches the current task fingerprint.
   - Add acceptance-pack builder and recorder that stores stage `acceptance`, kind `acceptance`, path `acceptance.md`.
   - Include the derived acceptance pack in `toTaskResponse`.
   - Ensure `qa` and `acceptance` artifacts appear in generic workflow timeline output.

3. QA runner
   - Add `packages/agent/src/subagents/qa.ts`.
   - Implement strict parser and exported parse function for tests.
   - Pass the mandatory-check inventory into the parser and reject `passed` output with an empty inventory, omitted mandatory ids, duplicate mandatory ids, unknown mandatory ids, all-optional evidence, failed mandatory results, or skipped mandatory results.
   - Build QA prompt from task, requirements context for stage `qa`, implementation log/manifest, review comments, and accepted research/design artifacts already supplied by requirements context.
   - Record accepted or blocked `qa.md` task stage artifact attempts with source fingerprint, inventory hash, implementation manifest hash, changed-files digest, review comments hash, review iteration count, and source snapshot id.
   - On failed/blocked status, move task to `blocked_external` from `qa`.

4. Coordinator integration
   - Import `runQa` and acceptance helpers.
   - Add QA stage to the pipeline and active-pipeline filtering.
   - Route reviewer accepted success to QA when enabled.
   - Route implementer skip-review success to QA when enabled.
   - Before any `done` transition with QA enabled, require a fresh accepted QA artifact, record a fresh acceptance pack bound to that QA artifact id/attempt/fingerprint, and then transition to done.
   - If a direct `done` handoff is attempted while QA is enabled and a fresh accepted QA artifact is missing, route the task to `qa` instead of `done`.
   - If QA is enabled but the accepted QA artifact is stale, block/reroute before done and record activity.
   - Broadcast timeline updates after QA/acceptance artifacts are recorded.

5. API/event guard
   - In `approve_done`, when QA is enabled, require accepted QA and acceptance artifacts before allowing `done -> verified`.
   - Preserve existing completion evidence checks and audit artifact state updates.

6. Web
   - Add QA column and status badge metadata.
   - Add `Acceptance` tab and acceptance view.
   - Show readiness summary in overview when present.

7. Tests
   - Update shared status/env/state-machine tests.
   - Add QA parser tests for passed, mandatory failed/skipped, optional skipped, missing mandatory id, duplicate mandatory id, unknown mandatory id, empty inventory/all-optional passed, and malformed/multiple block cases.
   - Add data tests for mandatory inventory construction, stale QA artifact rejection after implementation/review fingerprint changes, fresh acceptance-pack projection, stale acceptance artifact rejection, and timeline artifacts.
   - Add coordinator tests for QA disabled compatibility, `AIF_REQUIREMENTS_QA_ENABLED=true` with intake disabled still routing `review -> done`, QA enabled `review -> qa -> done`, `skipReview -> qa`, direct done reroute, stale QA blocking/reroute, and failed QA blocking.
   - Add data/watchdog queue tests that `qa` participates in coordinator candidates, active pipeline counts, project queue `executionActiveCount`, branch-bound active-task detection, stale claim cleanup, and stale in-progress watchdog recovery.
   - Add web tests for QA status/acceptance tab rendering.

8. Verification
   - Run focused tests first for changed packages.
   - Run repository commands required by AGENTS: `npm.cmd run lint`, `npm.cmd run build`, `npm.cmd test`.
   - Run independent `TEST PASS` and final `REVIEW PASS` gates before close-out.

## Acceptance Criteria Mapping

- QA stage/status and runner exist when QA enabled: steps 1, 3, 4, 7.
- `review -> qa -> done` enforced and direct `review -> done` blocked when QA required: step 4 coordinator routes/guard plus tests.
- QA produces `qa.md` and records command/skipped evidence: step 3 parser/recorder plus tests.
- Failed mandatory checks block done: step 3 blocking and step 4 done guard.
- Done acceptance pack shows required fields: step 2 builder/recorder and step 6 UI.
- `verified` only through human approval: no coordinator path writes `verified`; step 5 preserves `approve_done`.

## Rollback

The implementation is feature-flagged. If issues are found, set `AIF_REQUIREMENTS_QA_ENABLED=false` to restore current `review -> done` behavior while leaving the additive code dormant. Code rollback should remove the QA status/stage, runner, acceptance pack helpers, UI tab/column, and tests from this plan.

## Plan Review History

- 2026-05-29: Independent plan review returned `PLAN FAIL`.
- Revisions added mandatory-check inventory enforcement, artifact freshness binding, queue/watchdog semantics coverage, stale-artifact regression tests, and the explicit `QA flag true + intake false` compatibility test.
- Second re-review required explicit `buildProjectQueueState().executionActiveCount` and `listStaleInProgressTasks()` coverage; both are now in the design and verification plan.

## Plan Review Request

Independent reviewer must return `PLAN PASS` only if this plan is sufficient, fail-closed, and respects the task boundaries. Otherwise return `PLAN FAIL` with required revisions.
