<!-- Managed by RDPI for task work-20260528-requirements-intake-mvp. -->

# Research

## Task framing and lane

Task: implement the Requirements Intake MVP from the RU canonical requirements document dated 2026-05-28.

Lane: `work`.

MVP boundary:

- add `requirements_analysis` and `needs_input` statuses;
- add structured requirement questions persistence;
- add question list and answer APIs;
- add a requirements analyst runner with strict JSON parsing and deterministic local fallback for vague tasks;
- route `start_ai`/auto-queue/scheduled backlog advancement into `requirements_analysis` when feature flag is enabled;
- pause coordinator pickup while a task is in `needs_input`;
- auto-resume to `requirements_analysis` after all blocking questions in the active batch are answered;
- add a task detail questions panel;
- add focused tests for vague task -> needs_input -> answers -> requirements_analysis.

Out of MVP:

- requirements snapshots, research/design artifact tables, QA gate, acceptance pack, roadmap decomposition, and full stage-artifact UI.

## Accepted planning sources

- User-provided RU canonical requirements document in this conversation.
- `AGENTS.md` / repository instructions supplied by the user for `C:\Users\apron\source\aif-handoff`.
- `packages/shared/src/types.ts`: current `TASK_STATUSES`, task shape, event list, WS events.
- `packages/shared/src/stateMachine.ts`: current human transitions.
- `packages/shared/src/schema.ts`: Drizzle table definitions.
- `packages/shared/src/db.ts`: SQLite bootstrap, migrations, idempotent indexes.
- `packages/data/src/index.ts`: task row mapping, create/update helpers, coordinator candidate selection, auto-queue active counts.
- `packages/api/src/routes/tasks.ts`: task API patterns and broadcast behavior.
- `packages/api/src/schemas.ts`: Zod validation patterns.
- `packages/agent/src/coordinator.ts`: current four-stage pipeline and auto-queue/scheduler routes.
- `packages/agent/src/subagents/planner.ts` and `packages/agent/src/subagentQuery.ts`: runtime-backed subagent pattern.
- `packages/web/src/lib/api.ts`, `packages/web/src/hooks/useTasks.ts`, `packages/web/src/components/task/TaskDetail.tsx`, `TaskDetailHeader.tsx`, `components/kanban/*`: frontend data and detail layout.
- `docs/architecture.md`, `docs/api.md`, `docs/ops/runbook.md`: existing architecture/runtime docs.

No shared-memory lookup was used before `PLAN PASS`; local repository facts are sufficient for the MVP plan.

## Current behavior

- Human `start_ai` from `backlog` returns `planning`.
- Scheduled tasks and auto-queue call `claimBacklogTaskForAdvance`, which also writes `planning`.
- Coordinator stages are `planner`, `plan-checker`, `implementer`, and `reviewer`.
- Coordinator candidate selection ignores any unknown future status because it filters by known status values.
- `blocked_external` is currently used for runtime, review handoff, operator input, and other external/manual blocks.
- The board renders one column per `ORDERED_STATUSES` entry.
- Task detail already has extensible right-column tabs and left-column sections; adding a questions panel can be narrow.

## Relevant modules

- Shared contract: `packages/shared/src/types.ts`, `constants.ts`, `stateMachine.ts`, `schema.ts`, `db.ts`, `env.ts`.
- Data access: `packages/data/src/index.ts`.
- API: `packages/api/src/routes/tasks.ts`, `packages/api/src/schemas.ts`.
- Agent: `packages/agent/src/coordinator.ts`, `packages/agent/src/subagents/*`.
- Web: `packages/web/src/lib/api.ts`, `packages/web/src/hooks/useTasks.ts`, `packages/web/src/components/task/*`, `packages/web/src/components/kanban/*`.

## Constraints found

- The DB layer uses both Drizzle schema declarations and manual SQLite `CREATE TABLE IF NOT EXISTS` plus `MIGRATIONS`; both must be updated.
- Existing tests use in-memory DB bootstrap through `createTestDb`, so new tables/columns must be included in `ensureTables`.
- `TaskRow` mapping currently redacts task activity log and parses JSON fields manually; new task columns and question rows need explicit parsing/mapping.
- Human state transitions and auto-queue/scheduled transitions must be kept consistent or backlog tasks will bypass intake.
- Runtime-backed requirements analysis could make tests brittle; MVP should expose the runner contract but include a deterministic fallback path that creates questions from task text without requiring a live LLM.
- The UI imports browser-safe shared types, so new question types must be exported through `packages/shared/src/browser.ts`.

## Risks

- Changing the default `start_ai` destination affects existing behavior. Mitigation: add `AIF_REQUIREMENTS_INTAKE_ENABLED` default true and `AIF_REQUIREMENTS_INTAKE_FOR_EXISTING_TASKS` default false; MVP uses the flag at transition points.
- Adding task columns without idempotent migrations can break existing DBs. Mitigation: update table bootstrap, append migrations, and add indexes with `IF NOT EXISTS`.
- A too-naive requirements analyst can ask duplicate or low-value questions. Mitigation: persist `idempotencyKey` and block re-asking answered keys in the same task.
- Secret scanning can false-positive. Mitigation: MVP blocks obvious secret-like answer values and keys; deeper policy can be refined later.

## Dependencies

- Existing runtime profile resolution for task/plan stages is available, but the MVP can run deterministic analysis for tests and simple local operation.
- Existing broadcast system can emit new task/question events once the shared `WsEventType` union is extended.

## Unknowns

- Exact UI grouping preference for board columns can be refined later; MVP can show separate statuses in existing column model to avoid a larger board refactor.
- Whether requirements analysis should use plan or task runtime profile is not fixed. MVP can use `profileMode: "plan"` because it is pre-development reasoning.
- Existing data package exports are large; final implementation should keep new question helpers colocated with data access to avoid broad route-level SQL.

## Questions raised

No blocking product questions for Phase 1 MVP. The user-provided document already defines the first executable slice.

## Recommendation

Proceed to design and plan for Phase 1 only. Defer snapshots, research/design stages, QA, acceptance pack, and roadmap decomposition to follow-up tasks after the core clarification loop is stable.
