<!-- Managed by RDPI for task work-20260528-requirements-snapshot-and-stage-artifacts. -->

# Research - Requirements Snapshot And Stage Artifacts

## Task Framing And Lane

Task: `work-20260528-requirements-snapshot-and-stage-artifacts`.

Lane: `work`.

Implement the first durable slice after the Requirements Intake MVP: current requirements snapshots, generated `requirements.md` metadata, current/attempt records for stage artifacts, backend exposure, UI read surfaces, and downstream guards requiring a current snapshot or explicit waiver before later stages proceed.

This is implementation work, not an audit-only task. It must preserve the Phase 1 `requirements_analysis -> needs_input -> requirements_analysis` behavior, keep `needs_input` distinct from `blocked_external`, preserve behavior when `AIF_REQUIREMENTS_INTAKE_ENABLED=false`, and avoid changing audit/roadmap compatibility semantics.

## Accepted Planning Sources Or Local Facts

- Intake card: `docs/intake/work/work-20260528-requirements-snapshot-and-stage-artifacts.md`.
- Parent decomposition result confirms this child is the first implementation slice and the parent did not implement source changes: `docs/rdpi/work/work-20260528-requirements-intake-remaining-phases/result.md`.
- Parent research identifies the exact gap: `requirementsSnapshotId` exists on tasks, but there is no snapshot table/service or persisted `requirements.md` model; `research.md` and `design.md` are not platform artifacts yet: `docs/rdpi/work/work-20260528-requirements-intake-remaining-phases/research.md:57`.
- MVP research and plan establish the Phase 1 behavior to preserve, including feature-flag routing, `needs_input`, question APIs, and secret-like answer rejection: `docs/rdpi/work/work-20260528-requirements-intake-mvp/research.md`, `docs/rdpi/work/work-20260528-requirements-intake-mvp/plan.md`.
- The shared task schema already has `requirementsSnapshotId`, `needsInputBatchId`, `needsInputStage`, and `needsInputReason` on tasks: `packages/shared/src/schema.ts:102`.
- SQLite bootstrap/migration already added the Phase 1 requirements task fields and `task_requirement_questions`: `packages/shared/src/db.ts:92`, `packages/shared/src/db.ts:1220`.
- The existing requirements question model groups batches by `task_requirement_questions.batch_id`; there is no separate batch table: `packages/shared/src/schema.ts:165`.
- `validateRequirementAnswer()` rejects obvious secret-like answers before they are persisted as answers: `packages/shared/src/requirementsQuestions.ts:138`.
- Blocking question batches move tasks to `needs_input`; answering all blocking questions in the active batch can resume the task to the target stage and clear needs-input metadata: `packages/data/src/index.ts:2149`, `packages/data/src/index.ts:2450`.
- `runRequirementsAnalyst()` currently records confidence and activity only when detail is sufficient; it does not create a durable snapshot: `packages/agent/src/subagents/requirementsAnalyst.ts:157`.
- `start_ai` and backlog auto-advance route to `requirements_analysis` only while requirements intake is enabled; disabled behavior routes to `planning`: `packages/shared/src/stateMachine.ts:71`, `packages/agent/src/coordinator.ts:299`.
- The coordinator deliberately avoids overwriting `needs_input` after the requirements analyst changes task status: `packages/agent/src/coordinator.ts:3039`.
- Generic timeline DTOs and artifact vocabulary exist, but artifact kinds do not include `requirements`, `research`, or `design`: `packages/shared/src/types.ts:334`.
- Non-audit task timelines are currently synthesized from task fields by `buildGenericArtifactSeeds()` and returned by `buildTaskWorkflowTimeline()`: `packages/data/src/index.ts:6715`, `packages/data/src/index.ts:7918`.
- API exposure already includes `GET /tasks/:id/timeline` and `GET /tasks/:id/evidence`: `packages/api/src/routes/tasks.ts:514`, `packages/api/src/routes/tasks.ts:534`.
- Existing task question APIs cover Phase 1 intake and resume: `packages/api/src/routes/tasks.ts:934`, `packages/api/src/routes/tasks.ts:941`, `packages/api/src/routes/tasks.ts:983`, `packages/api/src/routes/tasks.ts:1020`.
- Web task detail already fetches the timeline and renders Timeline and Artifacts tabs: `packages/web/src/hooks/useTasks.ts:32`, `packages/web/src/components/task/TaskDetail.tsx:799`, `packages/web/src/components/task/TaskDetail.tsx:813`.
- `WorkflowTimelinePanel` already renders artifact state, path, current attempt, attempts, claims, and source snapshot ids, making it the lowest-risk UI read surface for requirements/research/design artifacts: `packages/web/src/components/task/WorkflowTimelinePanel.tsx:54`.
- The generic artifact persistence design requires pack-neutral current artifacts and append-only attempts beside audit compatibility tables, not by renaming or widening `roadmap_batch_*`: `docs/rdpi/work/work-20260513-design-generic-artifact-claim-persistence/design.md:56`, `docs/rdpi/work/work-20260513-design-generic-artifact-claim-persistence/design.md:92`, `docs/rdpi/work/work-20260513-design-generic-artifact-claim-persistence/design.md:278`.

## Delegated Research Summary

An independent explorer performed read-only local research and corroborated the same gaps and seams:

- `requirements_snapshot_id` exists, but there is no durable snapshot table/write path.
- Requirements questions already handle stages through `acceptance` and reject secret-like answers.
- Generic timeline/API/UI surfaces are the right exposure path.
- Minimal scope should add requirements snapshot and stage-artifact persistence without writing into audit compatibility tables or changing disabled-flag behavior.

## Same-Project Memory

Shared-memory recall was not used before `PLAN PASS` because this RDPI run is still inside the pre-plan boundary. Local repo facts, local RDPI artifacts, and local docs are sufficient for planning.

## Cross-Project Reusable Patterns

No cross-project memory was used. The relevant reusable pattern already exists locally in the generic artifact persistence RDPI design and in the current timeline implementation.

## Rejected Or Stale Memory Candidates

None inspected. No memory candidate was allowed to override current repo facts.

## Scope Boundaries

- In scope: durable requirements snapshots, `requirements.md` metadata/content generation, task-stage artifact current/attempt persistence for `requirements`, `research`, and `design` metadata, API exposure, UI readback via existing timeline/artifact surfaces, and downstream snapshot/waiver guards.
- In scope: prompt context hooks so planner, implementer, reviewer, and future QA can reference current snapshot and upstream artifact metadata.
- Out of scope: full runtime-backed requirements analyst, full research/design stage runners, QA gate, acceptance pack, roadmap split approval, and documentation rollout child tasks.
- Out of scope: changing audit roadmap tables, changing audit synthesis semantics, or migrating old audit rows into new generic tables.

## Open Questions And Planning Assumptions

- Physical `requirements.md`, `research.md`, and `design.md` files are not required in this slice unless the existing system already has a safe write location. The durable source of truth can be database metadata/content with artifact paths exposed as stable logical paths.
- The explicit waiver can be represented as a durable stage artifact row with `manual_exception`/`waived` semantics and a justification, then exposed through the same read model.
- Disabled flag compatibility means snapshot guards should be inactive when `AIF_REQUIREMENTS_INTAKE_ENABLED=false`.
