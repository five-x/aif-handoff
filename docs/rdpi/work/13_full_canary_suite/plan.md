# Plan - 13_full_canary_suite

## Scope

Run the current-code canary validation suite for the 10 scenarios in `C:\Users\apron\Desktop\aif_stabilization_tz_pack\13_full_canary_suite.md` and publish a final `result.md` table with current-run evidence.

This run is validation-first. No source changes are planned before evidence collection.

## Pre-implementation gate

1. Send the task input plus `research.md`, `design.md`, and this `plan.md` to an independent reviewer.
2. Require an explicit `PLAN PASS` or `PLAN FAIL`.
3. If `PLAN FAIL`, revise `design.md` and `plan.md`, then rerun the plan review gate.

## Execution after PLAN PASS

1. Capture baseline metadata:
   - `git rev-parse HEAD`
   - `git status --short`
   - repo root via `Get-Location`
2. Run focused canary command surfaces:
   - `npm.cmd --workspace @aif/runtime test -- --run src/__tests__/qwenLocalAgent.test.ts`
   - `npm.cmd --workspace @aif/agent test -- --run src/__tests__/coordinator.test.ts src/__tests__/implementer.test.ts src/__tests__/autoReviewHandler.test.ts`
   - `npm.cmd --workspace @aif/api test -- --run src/__tests__/tasks.test.ts`
   - `npm.cmd --workspace @aif/shared test -- --run src/__tests__/implementationManifest.test.ts src/__tests__/taskCompletionEvidence.test.ts src/__tests__/planningDecisionContract.test.ts src/__tests__/planQuality.test.ts src/__tests__/auditRoadmapContract.test.ts src/__tests__/runtimeStagePolicy.test.ts src/__tests__/systemTzGoldenRegressionCorpus.test.ts`
   - `npm.cmd --workspace @aif/data test -- --run src/__tests__/index.test.ts src/__tests__/workflowTimeline.test.ts`
3. Run full repo confidence commands:
   - `npm.cmd test`
   - `npm.cmd run build`
   - `npm.cmd run lint`
4. If any focused command passes but the terminal output is too coarse for a canary ledger, rerun the smallest relevant command with `--reporter verbose` or a targeted `-t` pattern. A rerun must not replace a failed broader command.
5. For each canary, read back enough test assertions or integration records to fill the required output fields:
   - task id or fixture identity;
   - project id/root;
   - commit SHA;
   - final status;
   - activity log lines or equivalent asserted events;
   - evidence artifact or timeline readback;
   - commands run;
   - PASS/FAIL.
6. Mark a canary `PASS` only when command evidence and readback evidence both support the expected behavior.
7. If a canary cannot be proven, mark it `FAIL` or `FOLLOW-UP REQUIRED`. Do not invent a pass from prior RDPI history.

## Implementation role handling

- Coder is skipped for the initial path because this is a validation-only task and no source edits are planned.
- If validation proves a missing canary harness rather than a product defect, stop and queue a follow-up intake card instead of adding the harness in this same run.
- If validation proves a product defect, stop with failing evidence and queue a follow-up implementation card. Do not fix it in this audit run.

## Test gate

1. Send the executed command transcript and draft canary table to an independent tester.
2. Require `TEST PASS` or `TEST FAIL`.
3. If `TEST FAIL`, correct only the result/evidence interpretation if the implementation is already valid. If the product behavior is invalid or evidence is missing, keep the task blocked or create follow-up intake.

## Final review gate

1. Send `result.md`, command transcript, and touched artifact paths to an independent reviewer.
2. Require `REVIEW PASS` or `REVIEW FAIL`.
3. If `REVIEW FAIL`, revise the result or follow-up intake and rerun invalidated gates.

## Closeout

1. Write `docs/rdpi/work/13_full_canary_suite/result.md` only after current-run evidence is available.
2. Record all gate outcomes and explain any skipped role.
3. Run `$memsync MODE=auto LANE=work TASK_ID=13_full_canary_suite`.
4. Treat local memsync review failure as a closeout blocker. Treat shared-memory publish failure as a warning only if local review artifacts were written successfully.

## Acceptance checks

- All 10 canaries have a table row.
- P0 canaries pass.
- P1 canaries pass or have an accepted follow-up intake.
- No infinite-loop behavior is accepted.
- No canary is marked PASS from prompt-only reasoning.
- `npm.cmd test`, `npm.cmd run build`, and `npm.cmd run lint` outcomes are recorded.
