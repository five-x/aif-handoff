# Plan

## Approved implementation plan candidate

1. Add `isImplementerInternalManifestReworkState(task: TaskRow): boolean` in `packages/agent/src/coordinator.ts` near the implementation evidence helpers.
   - Keep it narrow: implementing status, rework requested, manual review not true, `blockedReason` prefix `implementation_manifest_invalid:`, and null/absent `implementationManifestJson`.
   - Do not match `implementation_manifest_invalid_after_rework_limit:*`.

2. Add an implementer short-circuit in `advanceTask` after the existing implementer `blocked_external` terminal branch and before skip-review/review handoff/success reset.
   - Clear runtime limit snapshot.
   - Append activity log with `Implementer requested implementation manifest rework before review handoff`.
   - Log preserved fields.
   - Return `false`.
   - Do not call `updateTaskStatus` and do not mutate implementer-owned fields.

3. Add targeted coordinator tests in `packages/agent/src/__tests__/coordinator.test.ts`.
   - Missing manifest below cap: state remains `implementing`, `retryCount=1`, `implementationManifestJson=null`, `manualReviewRequired=false`, `reworkRequested=true`, reviewer not called, activity log present.
   - Changed files mismatch below cap: state remains `implementing`, reviewer not called, not `blocked_external`.
   - After cap: existing `blocked_external/manualReviewRequired=true` terminal behavior remains.
   - Unrelated implementing state: no manifest self-rework activity log, helper does not broadly swallow the state; assert current legacy behavior explicitly.

4. Run local verification after implementation:
   - `npm.cmd test --workspace=@aif/agent -- --run src/__tests__/coordinator.test.ts`
   - `npm.cmd test --workspace=@aif/agent -- --run src/__tests__/implementer.test.ts`
   - `npm.cmd test --workspace=@aif/shared -- --run src/__tests__/implementationManifest.test.ts src/__tests__/taskCompletionEvidence.test.ts`
   - `npm.cmd test`
   - `npm.cmd run build`
   - `npm.cmd run lint`
   - `git diff --check`

5. Write `docs/rdpi/work/03b_coordinator_invalid_manifest_rework_integration/result.md`.
   - Include `Task`, `Commit`, `Branch`, and `Status`.
   - Because RDPI instructions say not to commit unless explicitly requested, record `Commit: not created` unless the user later asks for a commit.
   - Include the required acceptance table.

6. After `PLAN PASS`, implementation, `TEST PASS`, and `REVIEW PASS`, run memsync:
   - `python "$env:USERPROFILE\.codex\tools\codex-memsync.py" --repo . --mode auto --lane work --task-id 03b_coordinator_invalid_manifest_rework_integration --project aif-handoff --entity aif-handoff`

## Acceptance checks

- Coordinator short-circuits implementer-owned `implementation_manifest_invalid:*` self-rework.
- Task stays `implementing`.
- `reworkRequested=true`.
- `manualReviewRequired=false`.
- `retryCount` does not double increment.
- `implementationManifestJson=null`.
- `runReviewer` is not called.
- Review-handoff completion evidence guard does not override below-cap self-rework to `blocked_external`.
- After-cap invalid-manifest terminal state remains `blocked_external/manualReviewRequired=true`.
- Unrelated `status=implementing` is not swallowed by the new guard.
- Existing implementer invalid-manifest tests keep passing.

## Gate requirements

- Independent plan review must return `PLAN PASS` before code edits.
- Independent tester must return `TEST PASS` after implementation.
- Independent final reviewer must return `REVIEW PASS` before close-out and memsync.
