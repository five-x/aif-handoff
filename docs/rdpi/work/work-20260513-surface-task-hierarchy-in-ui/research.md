<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

# Research

## Task Framing And Lane

- Task: `work-20260513-surface-task-hierarchy-in-ui`
- Lane: work
- Intake card: `docs/intake/work/work-20260513-surface-task-hierarchy-in-ui.md`
- Scope: expose hierarchy in existing web UI while preserving status-first Kanban and flat-task workflows.
- Depends on: schema/API response fields from the hierarchy contract slice.

## Accepted Planning Sources Or Local Facts

- `packages/web/src/components/kanban/TaskCard.tsx` renders flat cards with status, priority, intent, runtime, trust, tags, and roadmap alias.
- `packages/web/src/components/kanban/TaskListTable.tsx` renders flat list rows with status, priority, owner, updated date, and backlog order controls.
- `packages/web/src/components/task/TaskDetail.tsx` renders detail tabs and overview rows, but no parent/children view.
- `packages/web/src/components/task/TaskDetailHeader.tsx` owns detail header actions and tabs.
- `packages/web/src/hooks/useTasks.ts` and `packages/web/src/lib/api.ts` already consume shared `Task` types, so type propagation should be mostly automatic.
- UI should not invent hierarchy client-side when API fields are missing.

## Same-Project Memory

- Not used before `PLAN PASS`.
- Equivalent planning facts came from local sources: the task card, parent RDPI design, repository files, and explorer output.

## Cross-Project Reusable Patterns

- None used.

## Rejected Or Stale Memory Candidates

- No stale memory accepted.

## Key Risks

- Nested card-in-card design would conflict with frontend guidance and make dense operational UI harder to scan.
- Container execution actions can remain visible unless UI conditions check `hierarchyRole`.
- List indentation must not break flat-task rendering.

## Open questions

- Whether all detail action guards have access to `hierarchyRole`; if a surface lacks it, prefer no unsafe action rather than assuming executable.

## Hypotheses

- Shared type propagation should minimize API/web drift once backend fields are added.
- Component tests can cover the flat-task no-op path and hierarchy rendering without browser automation.
