<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

# Plan

## Implementation Plan

1. Add small UI helpers for hierarchy labels, parent context, and child summary text.
2. Update `TaskCard` to show container/child summary badges without nested cards.
3. Update `TaskListTable` to indent children and show parent context.
4. Update `TaskDetail` overview to show hierarchy metadata and a direct children section.
5. Ensure container execution actions are not offered by detail action/header logic where the role is known.
6. Add component tests for flat tasks, parent containers, child rows, and blocked/verified child summary rendering.

## Verification Plan

- `npm.cmd test --workspace=@aif/web -- TaskCard TaskListTable TaskDetail TaskDetailHeader`
- `npm.cmd run lint`
- `npm.cmd run build`

## Acceptance Criteria

- Parent containers and child tasks are visible and navigable.
- Existing status-first Kanban and filters keep working.
- UI does not allow unsafe container execution actions.

## Reusable patterns

- Reuse existing shared `Task` types, route responses, and component test style.
- Keep hierarchy UI as additive metadata on existing views.
