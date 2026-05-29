<!-- Managed by RDPI for task work-20260528-requirements-snapshot-and-stage-artifacts. -->

# Result - Requirements Snapshot And Stage Artifacts

## Outcome

Implemented the durable requirements snapshot and stage artifact foundation for the requirements intake lifecycle.

The slice adds versioned current requirements snapshots, redacted requirements markdown generation, generic current/attempt records for requirements/research/design artifacts, backend API exposure, websocket invalidation, UI read surfaces, and downstream prompt context for planner, implementer, and reviewer stages.

## Implementation Summary

- Added `task_requirements_snapshots`, `task_stage_artifacts`, and `task_stage_artifact_attempts` tables, schema exports, shared types, indexes, and migration version 37.
- Added data-layer APIs for creating/current requirements snapshots, snapshot waiver checks, prompt context generation, stage artifact attempt recording, and workflow timeline projection.
- Created requirements snapshot generation after successful requirements analysis and coordinator guard behavior that routes planning back to `requirements_analysis` when no current snapshot or documented waiver exists.
- Added requirements snapshot API and websocket event support, plus frontend query invalidation and artifact/timeline read surfaces for requirements, research, and design artifacts.
- Added planner, implementer, and reviewer prompt context blocks that use the current requirements snapshot markdown without object interpolation.

## Gate Outcomes

- `PLAN FAIL`: the first independent plan review rejected the plan because endpoint acceptance, missing-snapshot guard behavior, and QA helper coverage were underspecified.
- `PLAN PASS`: the revised plan passed independent review after those constraints were made explicit.
- `TEST PASS`: the independent tester accepted the focused verification plan and reported all targeted tests, build, lint, and whitespace checks passing.
- `REVIEW FAIL`: the first final review found two blockers: nullable current artifact fields could not be explicitly cleared, and requirements snapshot `(task_id, version)` uniqueness/allocation was unsafe.
- `REVIEW PASS`: re-review passed after explicit-null clearing, transactional version allocation, unique `(task_id, version)` enforcement, and regression tests were added.

## Review Fixes

- `recordTaskStageArtifactAttempt` now distinguishes omitted fields from explicit `null` for `path`, `markdown`, `sourceSnapshotId`, and metadata.
- Requirements snapshot version allocation now runs inside the database transaction that inserts the snapshot and updates the task current pointer.
- `task_requirements_snapshots` now enforces unique `(task_id, version)` at table/index level.
- Added regression coverage for duplicate snapshot versions and explicit-null stage artifact clearing.

## Verification

- `npm.cmd test --workspace=@aif/data -- --run src/__tests__/requirementsQuestions.test.ts src/__tests__/workflowTimeline.test.ts` passed: 2 files, 15 tests.
- `npm.cmd test --workspace=@aif/api -- --run src/__tests__/tasks.test.ts` passed.
- `npm.cmd test --workspace=@aif/web -- --run src/__tests__/WorkflowTimelinePanel.test.tsx src/__tests__/TaskDetail.test.tsx` passed: 2 files, 51 tests.
- `npm.cmd test --workspace=@aif/agent -- --run src/__tests__/coordinator.test.ts src/__tests__/coordinatorRequirementsSnapshotGuard.test.ts src/__tests__/planner.test.ts` passed.
- `npm.cmd run build` passed: 7 packages built successfully.
- `npm.cmd run lint` passed with one existing warning in `packages/agent/src/subagents/reviewer.ts:1341` for unused `runRequiredSpecializedReviewers`.
- `git diff --check` passed.

## Memory Sync

- `python "$env:USERPROFILE\.codex\tools\codex-memsync.py" --repo . --mode auto --lane work --task-id work-20260528-requirements-snapshot-and-stage-artifacts --project aif-handoff --entity aif-handoff` completed.
- Report: `docs/memory/reports/work-20260528-requirements-snapshot-and-stage-artifacts-memsync-report.md`.
- Sync status: `skipped`.
- Reason: `no publishable curated documents`.
- Generated local artifacts include the task delta, project capsule, entity capsule, and memory sync report.

## Residual Risk

Concurrent duplicate snapshot version creation now fails closed on the unique constraint rather than retrying. The migration assumes no preexisting duplicate `(task_id, version)` rows.
