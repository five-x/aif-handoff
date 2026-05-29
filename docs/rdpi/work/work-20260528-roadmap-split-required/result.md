<!-- Managed by RDPI for task work-20260528-roadmap-split-required. -->

# Result

## Outcome

Implemented controlled roadmap split proposals.

Roadmap import and async generation now return `split_required` proposals instead of immediately creating runnable task rows. Proposed children are persisted in `task_split_proposals` with source fingerprints. Approval creates paused hierarchy task rows transactionally, emits only task creation/project refresh events, and does not wake the agent. Rejection records the decision and creates no tasks.

## Gate results

- Research/explorer: PASS. Explorer identified the roadmap API/service, hierarchy data model, shared schema/types, and web dialog as the required integration points.
- Plan review: initial PLAN FAIL on approval atomicity/idempotency and stale pending proposal reuse. Revised design/plan added source fingerprints, conflict semantics, and transactional approval rules.
- Plan review rerun: PLAN PASS.
- Implementation: PASS. Implemented by coder and integrated by lead.
- Test gate: TEST PASS after final hardening edit. Independent tester reran all required commands and confirmed web proposal coverage.
- Final review gate: REVIEW PASS. Reviewer found no blocking issues and confirmed the core contract.

## Changed files

- `packages/shared/src/types.ts`
- `packages/shared/src/schema.ts`
- `packages/shared/src/db.ts`
- `packages/shared/src/browser.ts`
- `packages/shared/src/index.ts`
- `packages/shared/src/__tests__/db.test.ts`
- `packages/data/src/index.ts`
- `packages/data/src/__tests__/index.test.ts`
- `packages/api/src/services/roadmapGeneration.ts`
- `packages/api/src/routes/projects.ts`
- `packages/api/src/schemas.ts`
- `packages/api/src/__tests__/roadmapGeneration.test.ts`
- `packages/api/src/__tests__/projects.test.ts`
- `packages/web/src/lib/api.ts`
- `packages/web/src/hooks/useWebSocket.ts`
- `packages/web/src/components/layout/RoadmapDialog.tsx`
- `packages/web/src/__tests__/RoadmapDialog.test.tsx`
- `docs/rdpi/work/work-20260528-roadmap-split-required/research.md`
- `docs/rdpi/work/work-20260528-roadmap-split-required/design.md`
- `docs/rdpi/work/work-20260528-roadmap-split-required/plan.md`
- `docs/rdpi/work/work-20260528-roadmap-split-required/result.md`

## Verification

- `npm.cmd test --workspace=@aif/shared -- --run src/__tests__/db.test.ts`
- `npm.cmd test --workspace=@aif/data -- --run src/__tests__/index.test.ts`
- `npm.cmd test --workspace=@aif/api -- --run src/__tests__/roadmapGeneration.test.ts src/__tests__/projects.test.ts`
- `npm.cmd test --workspace=@aif/web -- --run src/__tests__/RoadmapDialog.test.tsx`
- `npm.cmd run build`

All commands passed locally and in the independent tester rerun after the final data-layer hardening edit.

## Browser smoke

Started a temporary dev stack against a throwaway SQLite database, seeded a minimal project, opened the app at `http://localhost:5180`, selected the project, and opened the roadmap dialog. The temporary dev stack was stopped afterward. Direct in-page `CustomEvent` injection was restricted in the browser automation runtime, so websocket proposal rendering remains covered by `RoadmapDialog.test.tsx`.

## Residual risks

- `rejectTaskSplitProposal` still does not inspect the guarded update `changes` count. The current single-process synchronous API path makes a race unlikely, but this can be hardened later.
- Audit split approval reuses `importGeneratedTasks` and existing roadmap batch hooks, but there is no dedicated audit split-approval API test proving batch metadata survives approval.
- Pending proposals are reviewable from the immediate import response or websocket event. A missed event or page reload still lacks a proposal list/read UI.

## Memory sync

`python "$env:USERPROFILE\.codex\tools\codex-memsync.py" --repo . --mode auto --lane work --task-id work-20260528-roadmap-split-required --project aif-handoff --entity aif-handoff` completed the local memory-review phase.

- Status: `skipped`
- Reason: no publishable curated documents
- Report: `docs/memory/reports/work-20260528-roadmap-split-required-memsync-report.md`
- Generated local artifacts include the task delta, project capsule, entity capsule, and memory sync report.
