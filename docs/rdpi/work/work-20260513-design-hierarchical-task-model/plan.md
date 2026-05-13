# Plan - Hierarchical Task And Subtask Model

## Implementation plan

1. Finish this planning-only task by reviewing `research.md` and `design.md` through an independent `PLAN PASS` gate.
2. After `PLAN PASS`, create only follow-up intake cards. Do not implement schema, runtime, API, UI, or tests in this run.
3. Queue `work-20260513-add-task-hierarchy-schema-api-contract` for schema, migration, shared types, API create/update/list/read contracts, and MCP parity planning.
4. Queue `work-20260513-enforce-hierarchy-rollup-runtime-gates` for parent rollup, container execution guards, child update hooks, delete guards, and retry semantics.
5. Queue `work-20260513-surface-task-hierarchy-in-ui` for Kanban/list/detail hierarchy visibility and child navigation.
6. Queue `work-20260513-bridge-audit-roadmap-batches-to-hierarchy` for creating Plan B audit parent containers while preserving roadmap batch artifact authority.
7. Link the existing `work-20260513-plan-b-audit-decomposition-regression-suite` card as the regression-suite follow-up rather than duplicating it.
8. Run independent verification that the RDPI artifacts and follow-up intake cards satisfy this design task, then run final independent review.
9. Write `result.md`, run memsync auto mode, and update only the matching status entry for this task if local memory review succeeds.

## Acceptance criteria

- The design defines parent-child relationships using first-class task hierarchy fields.
- The design reuses existing task statuses for parent rollup and leaf execution without adding new statuses.
- The design defines blocking semantics: children block parents; child retry remains child-owned; parent retry cascade is deferred.
- The design defines close-out rules for `all_children_verified` and Plan B `synthesis_child_verified`.
- The design explains child creation, resume, retry, and attachment back to a parent.
- The design identifies reusable existing fields: `status`, `blockedReason`, `blockedFromStatus`, `retryAfter`, `retryCount`, `paused`, `roadmapAlias`, `tags`, `position`, `sessionId`, `branchName`, and `worktreePath`.
- The design identifies unavoidable schema fields: `parentTaskId`, `rootTaskId`, `hierarchyDepth`, `hierarchyRole`, `hierarchyPosition`, and `parentCloseoutPolicy`.
- The design limits nested subtasks to depth `2` for the current task -> subtask -> sub-subtask need.
- The run creates follow-up implementation cards and does not bundle implementation into this design task.

## Verification plan

- Independent plan review must return `PLAN PASS` before follow-up card creation.
- After follow-up card creation, verify files exist:
  - `docs/intake/work/work-20260513-add-task-hierarchy-schema-api-contract.md`
  - `docs/intake/work/work-20260513-enforce-hierarchy-rollup-runtime-gates.md`
  - `docs/intake/work/work-20260513-surface-task-hierarchy-in-ui.md`
  - `docs/intake/work/work-20260513-bridge-audit-roadmap-batches-to-hierarchy.md`
- Verify `docs/intake/work_index.md` has relative links for the four follow-up cards.
- Verify `docs/intake/work_status.json` has exactly those new follow-up entries plus the current task update at close-out.
- Run a format-safe JSON parse check for `docs/intake/work_status.json`.
- Verify this task's scoped artifacts are limited to `docs/intake/**` and `docs/rdpi/work/work-20260513-design-hierarchical-task-model/**` plus the four follow-up RDPI scaffold directories. If unrelated dirty `packages/**` files are present in the worktree, report them as pre-existing/unattributed residual risk rather than failing this design-only gate, unless the task patch itself touched those files.
- Independent tester must return `TEST PASS` for artifact/card verification.
- Independent final reviewer must return `REVIEW PASS` and confirm no source implementation was performed.

## Reusable patterns

- Keep generic hierarchy in core task fields, and keep workflow-specific artifact readiness in workflow-specific contracts.
- Use parent containers as coordination surfaces until there is a concrete requirement for executable parents.
- Queue implementation slices from design tasks; do not execute child implementation tasks in the same RDPI run.
