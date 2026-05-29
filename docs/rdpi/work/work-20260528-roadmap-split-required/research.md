<!-- Managed by RDPI for task work-20260528-roadmap-split-required. -->

# Research

## Task framing and lane

Task: `work-20260528-roadmap-split-required`.

Lane: `work`.

Intent: implement controlled broad-task decomposition through a `split_required` decision, with proposed child tasks stored separately from approved task rows and created only after explicit human approval.

Scope boundaries:

- Build on the existing task hierarchy model.
- Preserve audit roadmap compatibility and workflow pack boundaries.
- Preserve Phase 1 requirements intake behavior from `6565e2f8`.
- Preserve compatibility when `AIF_REQUIREMENTS_INTAKE_ENABLED=false`.
- Do not execute generated child tasks in the same flow that creates or approves them.

## Accepted planning sources or local facts

- Intake card: `docs/intake/work/work-20260528-roadmap-split-required.md`.
- Parent decomposition RDPI: `docs/rdpi/work/work-20260528-requirements-intake-remaining-phases/{research.md,design.md,plan.md,result.md}`.
- Current repo instructions: `AGENTS.md`.
- Phase 1 baseline: commit `6565e2f8 Implement requirements intake MVP`.
- Explorer findings from subagent `019e724d-6b6e-7502-8c82-48d53eba404a`.
- Static code inspection only; no runtime/service/log/scheduler probing was performed before `PLAN PASS`.

Current local facts:

- Roadmap API endpoints are in `packages/api/src/routes/projects.ts`. `POST /projects/:id/roadmap/import` currently extracts tasks, calls `importGeneratedTasks`, broadcasts created tasks, and sends `agent:wake`. Background generation follows the same import-and-wake pattern.
- Roadmap generation and import logic live in `packages/api/src/services/roadmapGeneration.ts`. `importGeneratedTasks` currently creates task rows directly with `createTask`; audit imports create or reuse an audit hierarchy parent and create roadmap batch artifacts through workflow-pack hooks.
- No proposed-child persistence table exists. The shared schema currently includes task rows, requirements questions/snapshots/stage artifacts, and roadmap batch tables, but no split proposal storage.
- Existing hierarchy fields are first-class task columns: `parentTaskId`, `rootTaskId`, `hierarchyDepth`, `hierarchyRole`, `hierarchyPosition`, and `parentCloseoutPolicy`.
- Data-layer hierarchy helpers already compute child metadata, promote parents to containers, exclude containers from runtime queues, and roll up parent status.
- Queue helpers already skip containers and paused tasks. This gives an existing safety mechanism for "created but not executable yet" child rows after approval.
- Roadmap UI is `packages/web/src/components/layout/RoadmapDialog.tsx`. It currently offers Generate Roadmap and Import Existing, then displays a created/skipped summary. It has no proposal review/approval state.
- Web API client methods for roadmap import/generation are in `packages/web/src/lib/api.ts`.
- Shared websocket payload types include `roadmap:complete` and `roadmap:error`, but no split/proposal event.
- Direct broad audit task creation currently fails with `AUDIT_DECOMPOSITION_REQUIRED` rather than producing a proposal. This slice should avoid weakening the audit guard unless it can preserve the trusted audit roadmap contract.
- Workflow pack boundaries are already explicit: shared `workflowPacks.ts` owns task validation, while API-local `roadmapWorkflowPacks.ts` supplies roadmap hooks by intent.
- `AIF_REQUIREMENTS_INTAKE_ENABLED=false` is honored by task transitions and coordinator routing; approved children can remain ordinary backlog rows and will use the existing start path when unpaused.

## Same-project memory

Not queried before `PLAN PASS` because this RDPI phase is planning-only and local repo facts were sufficient.

## Cross-project reusable patterns

Not queried before `PLAN PASS`.

## Rejected or stale memory candidates

No shared-memory candidates were read.

## Key risks

- Current roadmap import creates executable task rows and wakes the agent in the same API flow; the split path must prevent both until approval.
- Changing audit roadmap import can break batch artifact, synthesis, and dependency-order behavior. Reuse existing import hooks for approved proposals instead of duplicating audit logic.
- A proposal approval that creates child tasks but leaves them unpaused could race with auto-queue or scheduler wakeups. Approved child rows should be created paused and the approval route should not emit `agent:wake`.
- Existing hierarchy max depth is limited; this task should implement direct parent -> child proposal approval and not recursive grandchild execution.
- The worktree already contains many unrelated local changes from prior RDPI slices. Edits must be scoped and must not revert those changes.
