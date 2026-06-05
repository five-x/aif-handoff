# Design - 13_full_canary_suite

## Validation model

This task validates current repo behavior. It does not start with source implementation. The implementation role is skipped unless the approved plan or a failed gate proves that a small, scoped canary harness is missing and explicitly authorizes adding it.

The final output is `docs/rdpi/work/13_full_canary_suite/result.md` with a table for all 10 canaries. A canary can be marked `PASS` only when current-run evidence shows:

- the mapped command or commands passed;
- the expected status or blocker was asserted by a test or direct readback;
- activity/timeline/artifact expectations are covered by test output, test assertions, or integration readback;
- no required field is filled from historical docs alone.

If a canary lacks executable proof, it is `FAIL` or `FOLLOW-UP REQUIRED`, not a prompt-only pass.

## Canary ledger schema

Each row in `result.md` will record:

- Canary number and name.
- Logical/current-run task id. For unit/integration harnesses this may be the fixture task id or test case identity when the fixture does not expose an external UUID.
- Project id or project root.
- Commit SHA under test.
- Final status expected and observed.
- Activity log lines or the exact assertion/readback that proves equivalent behavior.
- Evidence artifact or timeline readback.
- Commands run.
- Verdict: `PASS`, `FAIL`, or `FOLLOW-UP REQUIRED`.

## Command evidence strategy

Use focused package tests first, then the full repo suite:

1. Runtime canaries and policy guards:
   - `npm.cmd --workspace @aif/runtime test -- --run src/__tests__/qwenLocalAgent.test.ts`
2. Agent coordinator and implementer workflow canaries:
   - `npm.cmd --workspace @aif/agent test -- --run src/__tests__/coordinator.test.ts src/__tests__/implementer.test.ts src/__tests__/autoReviewHandler.test.ts`
3. API lifecycle canaries:
   - `npm.cmd --workspace @aif/api test -- --run src/__tests__/tasks.test.ts`
4. Shared validation contract canaries:
   - `npm.cmd --workspace @aif/shared test -- --run src/__tests__/implementationManifest.test.ts src/__tests__/taskCompletionEvidence.test.ts src/__tests__/planningDecisionContract.test.ts src/__tests__/planQuality.test.ts src/__tests__/auditRoadmapContract.test.ts src/__tests__/runtimeStagePolicy.test.ts src/__tests__/systemTzGoldenRegressionCorpus.test.ts`
5. Data/timeline/trust rollup canaries:
   - `npm.cmd --workspace @aif/data test -- --run src/__tests__/index.test.ts src/__tests__/workflowTimeline.test.ts`
6. Full repo confidence:
   - `npm.cmd test`
   - `npm.cmd run build`
   - `npm.cmd run lint`

Focused commands may be rerun with `--reporter verbose` or narrower `-t` filters after failure or if the first output does not expose enough detail for the ledger.

## Canary mapping

| Canary                       | Primary evidence surface                                              | Required proof                                                                                                               |
| ---------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 1 Tool-loop containment      | Runtime qwen-local-agent tests plus shared runtime stage policy tests | repeated `read_file`, `git_status`, and `run_shell` stop fail-closed with no uncontrolled retry or wake loop                 |
| 2 Checklist incomplete       | Agent coordinator/implementer and shared completion evidence tests    | pending checklist keeps task blocked, prevents review transition, and records `reworkRequested=true`                         |
| 3 Invalid manifest fallback  | Agent implementer/coordinator and shared manifest tests               | invalid normalized fallback is diagnostic-only, accepted `implementationManifestJson` is absent, issue codes are visible     |
| 4 Allowed write paths        | Runtime scoped write policy tests                                     | source writes are denied, report artifact write is allowed, illegal write attempt prevents acceptance                        |
| 5 Planner split              | Planner/coordinator/API/shared planning contract tests                | broad task produces `split_required`, split proposal remains pending, parent is not `plan_ready`, implementer does not start |
| 6 Same failure               | Agent coordinator, auto-review, and API failure fingerprint tests     | second same validator failure fail-closes and does not queue a third attempt                                                 |
| 7 Runtime recovery delta     | Agent coordinator/implementer timeout recovery tests                  | same artifact SHA and same validator fingerprint produce no bounded retry and a no-delta fail-closed reason                  |
| 8 Operator verified closeout | API operator closeout tests and data trust rollup tests               | lifecycle routes to `review`, `qa`, or `done` as configured, no `agent:wake`, trusted stage artifact recorded                |
| 9 Audit positive no-findings | Shared audit evidence tests and agent audit synthesis tests           | trusted no-findings is accepted and weak findings are not promoted                                                           |
| 10 Audit negative fabricated | Shared audit evidence/golden corpus tests and agent audit tests       | fake output, placeholder hashes, or weak findings yield invalid/source_inconclusive/manual block and no accepted artifact    |

## Failure policy

- Treat all 10 canaries as required unless a plan reviewer explicitly reclassifies a specific canary as P1 follow-up eligible.
- Any P0 failure blocks closeout.
- Any P1 failure must produce a separate follow-up intake artifact and must not be implemented in this same run.
- If a command fails from an unrelated pre-existing dirty worktree condition, record the condition and rerun only after isolating that it is not caused by this task.
- Do not change source code while collecting validation evidence unless the independent plan review approves a concrete implementation step.

## Gates

- Independent `PLAN PASS` required before running tests or collecting live evidence.
- `TEST PASS` required from an independent tester after canary command execution.
- `REVIEW PASS` required from an independent final reviewer before writing closeout as successful.
- If mandatory delegation is blocked by tooling, stop and mark the task blocked.
