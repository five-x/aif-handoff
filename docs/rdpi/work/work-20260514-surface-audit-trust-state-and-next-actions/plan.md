# Plan - Surface Audit Trust State And Next Actions

## Implementation steps

1. Add shared DTO types in `packages/shared/src/types.ts`.
   - Define generic artifact trust rollup types and next-action codes.
   - Add optional `artifactTrust` to `Task`.
   - Export through existing shared/browser entrypoints.

2. Add a data-layer rollup adapter in `packages/data/src/index.ts`.
   - Reuse current audit artifact trust helpers.
   - Derive per-task current artifact rollup from roadmap batch artifact rows and latest attempts.
   - Derive source child counts for the batch.
   - Derive `trustedSynthesisInput`, `claimOutcome`, `reasonCodes`, `latestAttemptOutcome`, `synthesisReady`, `nextAction`, and display summary.
   - Keep existing `RoadmapBatchSummary` fields backward compatible.

3. Attach rollup to task API responses.
   - Update task route response shaping in `packages/api/src/routes/tasks.ts`.
   - Preserve existing endpoint paths and response fields.
   - Add list and detail tests for `done+valid`, `done+source_inconclusive`, `done+rejected`, `blocked_external+plan_quality`, `synthesis_not_ready`, and final audit inconclusive coverage.

4. Add web presentation helpers.
   - Centralize badge text/tone and short summary rendering for `artifactTrust`.
   - Keep client logic presentational and driven by API-provided fields.

5. Update primary UI surfaces.
   - `TaskCard`: show `done / untrusted artifact` and trusted valid distinctions on the same card.
   - `TaskListTable`: show compact artifact trust state in the status/title area.
   - `TaskDetailHeader`: show trust summary, batch counts, next action, artifact identifiers, and recovery identifiers.
   - `WorkflowTimelinePanel`: show original state, trust level, failure/reason codes, attempt state, and path in existing generic rows.

6. Add focused web tests.
   - Cover card rendering for `done+valid`, `done+source_inconclusive`, and `done+rejected`.
   - Cover table rendering for compact trust status.
   - Cover detail header rendering for `blocked_external+plan_quality`, `synthesis_not_ready`, and final audit inconclusive.
   - Cover timeline rendering for linked artifact claims, evidence, attempt states, report paths, and reason codes.

7. Run verification.
   - `npm.cmd test --workspace=@aif/api -- --run src/__tests__/tasks.test.ts`
   - `npm.cmd test --workspace=@aif/data -- --run src/__tests__/workflowTimeline.test.ts src/__tests__/index.test.ts`
   - `npm.cmd test --workspace=@aif/web -- --run src/__tests__/TaskCard.test.tsx src/__tests__/TaskListTable.test.tsx src/__tests__/TaskDetailHeader.test.tsx src/__tests__/WorkflowTimelinePanel.test.tsx`
   - `npm.cmd run build --workspace=@aif/shared`
   - `npm.cmd run build --workspace=@aif/data`
   - `npm.cmd run build --workspace=@aif/api`
   - `npm.cmd run build --workspace=@aif/web`
   - `npm.cmd run lint`
   - `git diff --check`

## Acceptance checks

- API task list/detail responses include compact artifact trust rollup for roadmap audit cards.
- `done` with untrusted artifact is visibly different from `done` with trusted valid artifact.
- Batch/source counts include trusted valid, inconclusive, rejected, missing, external blocked, synthesis pending, and total.
- Final synthesis waiting or blocked state names the reason category.
- Retry guidance does not suggest blind retry for terminal inconclusive reports.
- Timeline view links artifact rows, claims, evidence units, attempts, and report paths.
- Existing timeline endpoints remain compatible.

## Independent gates

- After this plan is written, run independent plan review and require explicit `PLAN PASS` before source edits.
- After implementation, run independent tester and require explicit `TEST PASS`.
- After tests pass, run independent final reviewer and require explicit `REVIEW PASS`.
- If any gate fails, revise the invalidated artifacts or implementation and rerun that gate.

## Memory and close-out

- Do not run shared-memory recall or memsync before `PLAN PASS`.
- After implementation, test, and review pass, write `result.md`.
- Then run `python "$env:USERPROFILE\.codex\tools\codex-memsync.py" --repo . --mode auto --lane work --task-id work-20260514-surface-audit-trust-state-and-next-actions --project aif-handoff --entity aif-handoff`.
- Mark the intake status `done` only if local memory review succeeds. Treat shared-memory publish failure after local review as a warning.
