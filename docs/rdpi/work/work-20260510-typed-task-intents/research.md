# Research

## Task framing and lane

- Task ID: `work-20260510-typed-task-intents`
- Lane: `work`
- Intake card: `docs/intake/work/work-20260510-typed-task-intents.md`
- RDPI path: `docs/rdpi/work/work-20260510-typed-task-intents`
- Current run: `$runtask work-20260510-typed-task-intents`; this is the explicit instruction to execute the queued task now. The intake card remains immutable task intent.

## Accepted planning sources

- `docs/intake/work/work-20260510-typed-task-intents.md`
- `AGENTS.md` instructions supplied in the thread and local repo instructions.
- Local source inspection only before `PLAN PASS`; no live server state, live roadmap generation, runtime profile mutation, validation card creation, or shared-memory recall was performed before this plan.

## Local repository facts

- Roadmap generation and import are centralized in `packages/api/src/services/roadmapGeneration.ts`.
  - Current local changes already added an audit-only `RoadmapIntent = "general" | "audit"` inference path.
  - Generation prompt branching currently exists only for audit vs general.
  - Extraction validation currently rejects incomplete/non-diagnostic audit tasks only.
  - Import currently adds audit tags and audit defaults but still has no persisted typed intent model.
- `POST /tasks` is implemented in `packages/api/src/routes/tasks.ts`.
  - It applies `defaultsForMode(plannerMode)` when `skipReview`, `planDocs`, or `planTests` are omitted.
  - It has no task-intent field and only exposes `isFix` as a coarse task type.
- MCP task creation and update are in `packages/mcp/src/tools/createTask.ts` and `packages/mcp/src/tools/updateTask.ts`.
  - They expose `isFix`, `plannerMode`, `skipReview`, and `useSubagents`, but no typed task intent.
- Shared task data types are in `packages/shared/src/types.ts`.
  - `Task` and `CreateTaskInput` have no task-intent field.
  - `ChatActionCreateTask` only supports `isFix`.
- SQLite schema lives in `packages/shared/src/schema.ts` and bootstrap/migrations in `packages/shared/src/db.ts`.
  - New task columns require both CREATE TABLE shape and a versioned migration.
- Data-layer task create/update lives in `packages/data/src/index.ts`.
  - `createTask` directly passes optional fields into Drizzle and relies on DB defaults for unspecified settings.
  - `toTaskResponse`, task summaries, and update patching must include any persisted task-intent field.
- Planner/implementer/reviewer prompts live in `packages/agent/src/subagents/*.ts`.
  - Current local changes already added audit-specific diagnostic report constraints.
  - Prompts can be aligned with a general typed-intent contract instead of a one-off audit-only rule.
- Completion evidence guard lives in `packages/shared/src/taskCompletionEvidence.ts`.
  - Current local changes already added stronger risky audit/review/discovery report checks.
  - The guard currently infers risky tasks from natural language/tags rather than a persisted intent field.
- The Add Task UI lives in `packages/web/src/components/kanban/AddTaskForm.tsx`.
  - It currently exposes Standard/Fix only.
  - Web API types are imported from `@aif/shared/browser`.
- Chat task actions are created by prompt blocks in `packages/api/src/routes/chat.ts` and parsed in `packages/web/src/lib/chatActions.ts`.
  - The current action JSON contains `title`, `description`, and `isFix`.
  - `packages/web/src/components/chat/CreateTaskCard.tsx` creates a task from that action without typed intent.
- Existing schema/migration test coverage is in `packages/shared/src/__tests__/schema.test.ts` and `packages/shared/src/__tests__/db.test.ts`.
  - New persisted task fields should be covered in both fresh-schema defaults and migration/backfill behavior.

## Same-project memory

- Same-project memory could help validate prior decisions around audit quality gates, but the RDPI pre-plan boundary forbids shared-memory recall before `PLAN PASS`.

## Cross-project reusable patterns

- Local instructions require explicit typed contracts and fail-closed validation for generated executable backlog entries.
- Local repo facts outrank memory and runtime assumptions.

## Open questions

- Whether broad existing natural-language roadmap behavior should remain named `general` or be migrated behind another intent. Decision for this task: keep `general` as explicit fallback.
- Whether direct UI task creation should force users to select intent or infer from title/description. Decision for this task: expose intent in UI while API/MCP/chat infer intent when omitted.

## Hypotheses

- A shared `taskIntent` module can centralize valid intents, defaults, planning guidance, decomposition constraints, evidence requirements, gate requirements, and generated-card validation.
- Persisting `taskIntent` on tasks will let planner/implementer/reviewer/completion-evidence paths stop relying only on prompt wording and regex inference.
- Roadmap generation can remain generic for `general` while typed intents add targeted prompt contracts and import defaults.
- Focused tests can cover intent inference, import defaults, audit rejection, feature defaults, and per-intent evidence/gate differences without requiring live runtime calls.
