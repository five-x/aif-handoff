<!-- Managed by RDPI for task work-20260528-requirements-intake-remaining-phases. -->

# Research

## Task framing and lane

Task: `work-20260528-requirements-intake-remaining-phases`.

Lane: `work`.

Intent: finish planning for the Requirements Intake & Clarification Loop work that remains after the Phase 1 MVP, then split the remaining implementation into safe child cards because the requested Phase 2-4 surface spans shared contracts, database migrations, API routes, agent orchestration, web UI, documentation, and regression/e2e coverage.

Execution boundary for this umbrella task:

- Preserve the committed Phase 1 baseline from `6565e2f8`.
- Do not re-implement the existing core `requirements_analysis -> needs_input -> requirements_analysis` loop.
- Do not execute child implementation cards in this run.
- Use this RDPI run to create accepted planning artifacts and queued child intake/RDPI scaffolds only.

## Accepted planning sources or local facts

- Intake card: `docs/intake/work/work-20260528-requirements-intake-remaining-phases.md`.
- Completed MVP planning: `docs/rdpi/work/work-20260528-requirements-intake-mvp/research.md`, `design.md`, and `plan.md`.
- Commit baseline: `6565e2f8 Implement requirements intake MVP`.
- Local repo instructions: `AGENTS.md` and the user-supplied task-routing/RDPI rules.
- Generic artifact persistence design: `docs/rdpi/work/work-20260513-design-generic-artifact-claim-persistence/design.md`.
- Contract freeze: `docs/kb/system-tz-contract-inventory-freeze.md`.
- Workflow pack boundary: `docs/kb/workflow-contract-pack-registry.md`.
- Independent explorer findings from subagent `019e701f-09b4-7b63-b116-24d6104bcaff`.

No shared-memory lookup was used before `PLAN PASS`; the RDPI boundary for this task allows local files and docs only before plan review.

## Phase 1 baseline

The MVP is already present and should be treated as baseline:

- `packages/shared/src/types.ts:5` includes `requirements_analysis` and `needs_input`.
- `packages/shared/src/types.ts:34` includes coordinator stage `requirements-analyst`.
- `packages/shared/src/stateMachine.ts:63` routes `start_ai` to `requirements_analysis` when the requirements-intake option is enabled.
- `packages/shared/src/stateMachine.ts:175` intentionally leaves `needs_input` without generic human task events; answers flow through question APIs.
- `packages/shared/src/requirementsQuestions.ts:1` already has question stages for `requirements_analysis`, `research`, `design`, `planning`, `implementing`, `review`, `qa`, and `acceptance`.
- `packages/shared/src/requirementsQuestions.ts:138` validates answers and rejects obvious secret-like values.
- `packages/shared/src/schema.ts:100` adds MVP task fields, including `requirements_snapshot_id`, but no durable snapshot table.
- `packages/shared/src/schema.ts:165` adds `task_requirement_questions`.
- `packages/data/src/index.ts:2149` creates question batches and moves blocking batches to `needs_input`.
- `packages/data/src/index.ts:2361` answers batches and auto-resumes via `targetResumeStage`.
- `packages/agent/src/coordinator.ts:149` inserts the requirements analyst before planning.
- `packages/agent/src/coordinator.ts:3032` avoids overwriting a runner-created `needs_input` status.
- `packages/agent/src/subagents/requirementsAnalyst.ts:104` is deterministic MVP analysis only; runtime-backed strict JSON requirements analysis remains future work.
- `packages/api/src/routes/tasks.ts:934` and `packages/api/src/routes/tasks.ts:1013` expose Phase 1 question APIs.
- `packages/web/src/components/task/QuestionsPanel.tsx:81` and `packages/web/src/components/task/TaskDetail.tsx:665` expose the Phase 1 question UI.

## Remaining implementation seams

Phase 2 snapshots and artifacts are mostly absent:

- `requirementsSnapshotId` exists on tasks, but there is no requirements snapshot table/service and no persisted `requirements.md` current-state/attempt model.
- Current generic task timeline projection derives artifacts from task fields rather than durable generic workflow artifact rows. See `packages/data/src/index.ts:6715` and `packages/data/src/index.ts:7918`.
- `research.md` and `design.md` are not platform stage artifacts; no coordinator stages or validation gates require them before downstream work.

Phase 2 research/design stages are absent:

- The coordinator pipeline remains `requirements-analyst -> planner -> plan-checker -> implementer -> reviewer` at `packages/agent/src/coordinator.ts:149`.
- `COORDINATOR_STAGES` lacks researcher/designer stages at `packages/shared/src/types.ts:34`.
- Planner prompts do not reference a durable current requirements snapshot, research artifact, or design artifact. See `packages/agent/src/subagents/planner.ts:328`.

Phase 3 QA and acceptance are absent:

- Reviewer success still moves directly to `done` at `packages/agent/src/coordinator.ts:179`.
- Skip-review implementation can also move directly to `done` at `packages/agent/src/coordinator.ts:3085`.
- There is no `qa` task status, `qa_status` field, QA runner, `qa.md`, QA evidence contract, review-to-QA gate, or result/acceptance pack.
- `verified` remains human gated today: `approve_done` moves only `done -> verified` at `packages/shared/src/stateMachine.ts:127`. This must be preserved.

Phase 4 split handling is absent:

- Task hierarchy support exists in data and UI, including child summaries and parent references in `packages/data/src/index.ts:514` and `packages/web/src/components/task/TaskDetail.tsx:514`.
- Roadmap generation/import exists in `packages/api/src/services/roadmapGeneration.ts`, but there is no generic `split_required` decision, proposed-child persistence contract, approval UI, or controlled child creation flow for requirements intake.

Cross-stage question routing is partial:

- Question stages already include downstream stages, but `taskStatusForRequirementResume` maps unsupported target stages back to `requirements_analysis` in `packages/data/src/index.ts:905`.
- Planner/implementer/reviewer paths still rely on `blocked_external` or review/manual-handoff patterns for many product-clarification cases.
- The distinction between `needs_input` product clarification and `blocked_external` infrastructure/operator failure is established by the MVP, but downstream agents do not yet use it consistently.

Docs and rollout are incomplete:

- `docs/architecture.md`, `docs/api.md`, `docs/configuration.md`, and `docs/ops/runbook.md` do not document the full requirements lifecycle, snapshot/artifact APIs, QA gate, split approval flow, or rollout/compatibility behavior.
- Existing feature flags cover Phase 1 intake and needs-input active-count behavior, but later phase flags are not defined.

## Same-project memory

Not queried before `PLAN PASS` due the RDPI boundary in this repository. Relevant local curated docs were used instead: `docs/kb/system-tz-contract-inventory-freeze.md` and `docs/kb/workflow-contract-pack-registry.md`.

## Cross-project reusable patterns

Not queried before `PLAN PASS`.

## Rejected or stale memory candidates

No shared-memory candidates were read. No memory was rejected.

## Scope conclusion

The remaining work is too broad for one safe implementation run. It should be decomposed into separate child implementation cards with explicit dependencies:

1. Requirements snapshots and generic stage-artifact persistence.
2. Research/design stages and validation gates.
3. QA gate and acceptance pack.
4. Cross-stage structured question/resume routing.
5. `split_required` and controlled proposed-child approval.
6. Observability, docs, rollout flags, and final compatibility/e2e coverage.

This umbrella RDPI should close only as a decomposition/planning task. It must not claim the platform lifecycle is feature-complete until the queued child cards run and pass their own RDPI gates.
