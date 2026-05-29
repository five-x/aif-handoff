<!-- Managed by RDPI for task work-20260528-roadmap-split-required. -->

# Plan

## Gate plan

1. Independent plan review:
   - [x] Send the intake card plus `research.md`, `design.md`, and this `plan.md` to an independent reviewer.
   - [x] Incorporate the first `PLAN FAIL` feedback on approval atomicity/idempotency and stale proposal fingerprints.
   - [x] Rerun independent plan review on the revised artifacts.
   - [x] Require explicit `PLAN PASS` before implementation.
   - [ ] If review returns `PLAN FAIL`, revise planning artifacts and rerun review.

2. Implementation:
   - [x] Add shared split proposal types, websocket payload typing, schema table, migration, and indexes, including `source_fingerprint`.
   - [x] Add data-layer create/read/reject/approve helpers for split proposals with compare-and-set status guards.
   - [x] Refactor roadmap import service so project endpoints create `split_required` proposals while approval reuses existing task-import behavior inside one database transaction.
   - [x] Compute proposal fingerprints from normalized source content, alias, intent, and canonical proposed children; same-alias pending proposals with different fingerprints must return conflict.
   - [x] Add project API routes for approving and rejecting proposals and update async generation broadcast handling.
   - [x] Update web API client and `RoadmapDialog` to review, approve, and reject proposed children.
   - [x] Add targeted shared/data/API/web tests, including double approval, stale pending proposal conflict, reject-after-approve, and requirements-intake start-path regression coverage.

3. Verification:
   - [x] Run targeted tests for shared/data/API/web split behavior.
   - [x] Run `npm.cmd run build` if targeted tests pass.
   - [x] Independent tester verifies commands and behavior, requiring explicit `TEST PASS`.
   - [ ] If tester returns `TEST FAIL`, fix blockers and rerun tester.

4. Final review:
   - [x] Independent reviewer verifies implementation against this plan and the intake card.
   - [x] Require explicit `REVIEW PASS`.
   - [ ] If review returns `REVIEW FAIL`, fix blockers and rerun invalidated gates.

5. Close-out:
   - [x] Write `result.md` with gate outcomes, changed files, verification commands, and residual risk.
   - [x] Run `$memsync MODE=auto LANE=work TASK_ID=work-20260528-roadmap-split-required`.
   - [x] Mark only this task entry in `docs/intake/work_status.json` as `done` after local memory review succeeds.

## Acceptance criteria

- Roadmap import/generation can return `status: "split_required"` instead of immediately creating child task rows.
- Proposed children are persisted in `task_split_proposals`, separate from the `tasks` table.
- Approval API creates child task rows only after an explicit human approval call.
- Approval is transaction-safe: task rows, batch metadata, and proposal approval status commit together, and failed approval leaves no partial rows.
- Duplicate approval is idempotent and does not create duplicate tasks; reject-after-approve returns conflict.
- Pending proposal reuse requires a matching `source_fingerprint`; changed roadmap/generated content returns conflict rather than approving stale children.
- Rejection API records the rejection and creates no task rows.
- Approval creates/uses a hierarchy parent and attaches children without replacing the existing hierarchy model.
- Approved children are paused and no `agent:wake` is emitted by proposal approval.
- Audit roadmap approval still creates roadmap batch artifact metadata and preserves synthesis/parent rollup behavior.
- Workflow-pack validation remains the source of typed generated-task validation.
- With `AIF_REQUIREMENTS_INTAKE_ENABLED=false`, approved children are still backlog rows and use the existing flag-aware task start behavior later.
- With `AIF_REQUIREMENTS_INTAKE_ENABLED=true`, approval still does not start execution; a later explicit start follows the existing requirements-intake staging path.
- No follow-up child task is executed in this run.

## Proposed verification commands

- `npm.cmd test --workspace=@aif/shared`
- `npm.cmd test --workspace=@aif/data -- --run packages/data/src/__tests__/index.test.ts`
- `npm.cmd test --workspace=@aif/api -- --run packages/api/src/__tests__/roadmapGeneration.test.ts packages/api/src/__tests__/projects.test.ts`
- `npm.cmd test --workspace=@aif/web -- --run packages/web/src/__tests__/RoadmapDialog.test.tsx`
- `npm.cmd run build`

Targeted cases to add or update:

- Import/generation returns `split_required`, persists a proposal, and creates no `tasks` rows.
- Re-import with the same source fingerprint returns the same pending proposal.
- Re-import with changed source content for the same pending alias returns conflict.
- Approval creates a paused container/children and marks the proposal approved in one transaction.
- Repeated approval creates no duplicate tasks and returns the stored approved proposal/ids.
- Rejection creates no rows; reject-after-approve returns conflict.
- Requirements-intake enabled/disabled start-path behavior remains controlled by the existing later explicit start flow, not by proposal approval.

## Files likely to change

- `packages/shared/src/schema.ts`
- `packages/shared/src/db.ts`
- `packages/shared/src/types.ts`
- `packages/shared/src/browser.ts`
- `packages/shared/src/index.ts`
- `packages/shared/src/__tests__/db.test.ts`
- `packages/data/src/index.ts`
- `packages/data/src/__tests__/index.test.ts`
- `packages/api/src/schemas.ts`
- `packages/api/src/routes/projects.ts`
- `packages/api/src/services/roadmapGeneration.ts`
- `packages/api/src/__tests__/roadmapGeneration.test.ts`
- `packages/api/src/__tests__/projects.test.ts`
- `packages/web/src/lib/api.ts`
- `packages/web/src/components/layout/Header.tsx`
- `packages/web/src/components/layout/RoadmapDialog.tsx`
- `packages/web/src/__tests__/RoadmapDialog.test.tsx`
- `docs/rdpi/work/work-20260528-roadmap-split-required/result.md`
- `docs/intake/work_status.json`

## Out of scope

- Direct broad audit proposal creation from `POST /tasks`.
- Proposal child editing.
- Auto-unpause or auto-run of approved children.
- Documentation rollout.
