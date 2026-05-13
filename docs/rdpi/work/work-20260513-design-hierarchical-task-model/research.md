# Research - Design Hierarchical Task And Subtask Model

## Task framing and lane

- Task: `work-20260513-design-hierarchical-task-model`.
- Lane: `work`.
- Intake card: `docs/intake/work/work-20260513-design-hierarchical-task-model.md`.
- The card asks for a design, not source implementation: define parent-child relationships, status rollup, blocking semantics, close-out rules, creation/resume/retry behavior, unavoidable schema changes, nested subtask depth, and follow-up implementation cards.
- Preflight was clean: `codex-ensure-rdpi.py` returned `STATUS: ready`; `codex-flow-audit.py --repo .` returned `STATUS: clean`.

## Accepted planning sources or local facts

- The selected card is immutable task intent for this run. It explicitly says this is a design/planning task unless implementation is queued later.
- Current task persistence is flat. The `tasks` table has `status`, `priority`, `position`, planner/runtime fields, `roadmapAlias`, tags, blocking fields, branch/worktree fields, and timestamps, but no parent, root, depth, child ordering, dependency, or rollup columns (`packages/shared/src/schema.ts:67`).
- The shared `Task` type mirrors the flat task model and exposes no hierarchy fields (`packages/shared/src/types.ts:118`).
- Task statuses are a single enum: `backlog`, `planning`, `plan_ready`, `implementing`, `review`, `blocked_external`, `done`, and `verified` (`packages/shared/src/types.ts:3`).
- Human status events operate on one task at a time. `start_ai` starts only from `backlog`; `retry_from_blocked` uses `blockedFromStatus` to resume the same task, not a child graph (`packages/shared/src/stateMachine.ts:31`).
- API task create/update schemas expose roadmap, tag, runtime, scheduling, and blocking fields but no parent/child contract (`packages/api/src/schemas.ts:55`, `packages/api/src/schemas.ts:85`).
- `POST /tasks` resolves intent defaults, rejects broad direct audit requests, then creates one flat task and wakes the coordinator (`packages/api/src/routes/tasks.ts:128`).
- Task list responses are flat, sorted by status and position (`packages/api/src/routes/tasks.ts:102`; `packages/data/src/index.ts:665`).
- `createTask()` inserts one backlog row, computes a plan path, applies task-intent defaults, and assigns a flat backlog `position` (`packages/data/src/index.ts:824`).
- Kanban groups tasks by `task.status`; roadmap is only a filter based on tags and `roadmapAlias` (`packages/web/src/components/kanban/Board.tsx:73`, `packages/web/src/components/kanban/Board.tsx:108`).
- Task cards render tags and roadmap alias, but no hierarchy or child summary (`packages/web/src/components/kanban/TaskCard.tsx:122`).
- Roadmap import already creates ordered child-like task batches using tags `roadmap`, `rm:<alias>`, `phase:*`, and `seq:*` (`packages/api/src/services/roadmapGeneration.ts:1688`).
- Audit roadmap persistence is the closest existing parent model. `roadmap_batches` stores batch status, synthesis task id, created task ids, and artifact counts; `roadmap_batch_artifacts` links artifact rows to task ids (`packages/shared/src/schema.ts:149`, `packages/shared/src/schema.ts:179`).
- Audit roadmap import creates independent backlog tasks and, only for audit, creates a roadmap batch contract with report/synthesis artifact rows (`packages/api/src/services/roadmapGeneration.ts:1733`, `packages/api/src/services/roadmapGeneration.ts:1943`).
- Audit synthesis readiness already blocks and unblocks the synthesis task by updating `paused` and `blockedReason` based on artifact states (`packages/data/src/index.ts:3225`).
- Audit artifact attempts track retry history separately from task retry fields (`packages/shared/src/schema.ts:211`; `packages/data/src/index.ts:3295`).
- Existing DB migrations are versioned in `packages/shared/src/db.ts`; new migrations must be appended, not reordered (`packages/shared/src/db.ts:438`).
- Prior RDPI design for splitting broad audit requests intentionally reused roadmap batches and rejected generic parent/child schema for that narrower task because this task owns the broader hierarchy design (`docs/rdpi/work/work-20260513-split-broad-audit-requests-into-micro-report-cards/design.md`).
- Prior workflow-pack design keeps core handoff mechanics separate from workflow-specific semantics; a hierarchy model should stay compatible with non-audit workflows and not bake audit-only artifact states into generic task status (`docs/rdpi/work/work-20260513-define-workflow-contract-pack-interface/design.md`).

## Same-project memory

- Shared-memory recall was not queried before `PLAN PASS` because the repository RDPI rules prohibit shared-memory recall before the plan gate unless explicitly waived.
- Local same-project planning artifacts were used where directly relevant: the split-broad-audit design and workflow-contract-pack design. They are accepted as local planning context, not live evidence.

## Cross-project reusable patterns

- No cross-project memory was queried before `PLAN PASS`.
- Reusable local pattern: keep durable contracts visible and diffable, split broad runtime/schema/UI changes into narrow implementation cards, and preserve existing workflow-specific containment while adding generic core primitives.

## Rejected or stale memory candidates

- No memory candidates were marked stale. No shared-memory recall was performed.
- Reusing only `tags` and `roadmapAlias` for hierarchy is rejected as the durable model because those fields lack referential integrity, depth limits, rollup semantics, and close-out gates.
- Reusing `roadmap_batches` as the generic hierarchy is rejected because the table is artifact-oriented and audit-roadmap specific. It should be bridged to hierarchy, not become the generic task tree.

## Open questions

- Whether future non-audit parent tasks should ever execute their own planner/implementer/reviewer stages after children finish. The smallest current design treats parent tasks as coordination containers.
- Whether optional/non-blocking children are needed in the first implementation slice. Current Plan B needs required source reports plus synthesis; optional children can be deferred.
- Whether task hierarchy should be exposed in MCP create/update tools in the first schema/API slice or in a follow-up parity slice. API and web parity should not drift for long.

## Hypotheses

- The smallest robust model needs first-class task hierarchy fields on `tasks`, not only tags: parent id, root id, depth, child ordering, role, and close-out policy.
- Existing `TaskStatus` values can be reused for both leaf execution and parent rollup; a new status enum is not needed for the first slice.
- Existing `blockedReason`, `blockedFromStatus`, `paused`, and retry fields can continue to model leaf retry and external blockers. Parent retry should be driven by child retry until a real parent-execution requirement appears.
- Plan B audit decomposition can use a generic parent container while keeping roadmap batch artifacts as the authoritative source/synthesis evidence contract.
- A max depth of two child levels, root -> child -> grandchild, is enough for the current task -> subtasks -> sub-subtasks proposal and avoids premature closure-table work.
