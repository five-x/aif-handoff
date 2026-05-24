<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

# Research

## Task Framing And Lane

- Task: `work-20260513-add-task-hierarchy-schema-api-contract`
- Lane: work
- Intake card: `docs/intake/work/work-20260513-add-task-hierarchy-schema-api-contract.md`
- RDPI path: `docs/rdpi/work/work-20260513-add-task-hierarchy-schema-api-contract`
- Scope: first persistence/API/MCP contract slice for generic task hierarchy fields and derived child summary.
- Out of scope: runtime rollup enforcement, UI rendering, and audit roadmap attachment except where type fields are needed by follow-up cards.

## Accepted Planning Sources Or Local Facts

- Parent design `docs/rdpi/work/work-20260513-design-hierarchical-task-model/design.md` defines first-class task hierarchy fields: `parentTaskId`, `rootTaskId`, `hierarchyDepth`, `hierarchyRole`, `hierarchyPosition`, and `parentCloseoutPolicy`.
- The same design caps hierarchy depth at `2`, keeps parent containers as coordination surfaces, and keeps leaf children as the runtime execution unit.
- `packages/shared/src/schema.ts` currently defines a flat `tasks` table with no hierarchy columns.
- `packages/shared/src/types.ts` currently exposes flat `Task`, `CreateTaskInput`, and `UpdateTaskInput` contracts.
- `packages/shared/src/db.ts` owns SQLite table creation, migrations, indexes, and `createTestDb()`.
- `packages/data/src/index.ts` owns `TaskRow` mapping, `createTask`, `updateTask`, `deleteTask`, `listTasks`, `listTasksPaginated`, `toTaskResponse`, and `toTaskSummary`.
- `packages/api/src/schemas.ts` owns REST input validation for create/update.
- `packages/api/src/routes/tasks.ts` maps REST create/update/list/detail responses through data helpers.
- `packages/mcp/src/tools/createTask.ts`, `updateTask.ts`, `getTask.ts`, and `listTasks.ts` own MCP parity.
- Existing flat tasks must remain compatible and default to standalone executable tasks.
- Explorer research confirmed these same seams and found no existing implementation.

## Same-Project Memory

- Not used before `PLAN PASS`.
- Equivalent planning facts came from local sources: the task card, parent RDPI design, repository files, and explorer output.

## Cross-Project Reusable Patterns

- None used.

## Rejected Or Stale Memory Candidates

- No conflicting memory accepted. Local code and parent design are authoritative.

## Key Risks

- REST, data, shared, MCP, and web contracts can drift if fields are added in only one layer.
- Defaults must keep existing flat tasks safe without backfill.
- Relationship validation must reject cross-project parents, self-parenting, cycles, depth overflow, invalid roles, and invalid close-out policies without adding runtime rollup behavior in this slice.

## Open questions

- Whether REST/MCP should reject unknown computed fields explicitly or ignore them after schema stripping; either is acceptable only if tests prove computed values are not caller-controlled.

## Hypotheses

- Additive hierarchy columns with defaults are enough for backwards compatibility because existing flat rows can be interpreted as executable roots.
- Central data-layer validation will reduce REST/MCP drift.
