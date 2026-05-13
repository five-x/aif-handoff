# Enforce Hierarchy Rollup And Runtime Gates

- Task ID: work-20260513-enforce-hierarchy-rollup-runtime-gates
- Lane: work
- Status: queued
- Priority: high
- Created: 2026-05-13
- Due: unset
- Source: work-20260513-design-hierarchical-task-model RDPI
- RDPI Needed: yes
- RDPI Path: docs/rdpi/work/work-20260513-enforce-hierarchy-rollup-runtime-gates

## Request

Implement parent rollup, blocking semantics, execution guards, and close-out enforcement for the task hierarchy model.

Container tasks must not be picked up as normal runtime work. Child task state changes must recompute parent rollup without weakening existing leaf task retry/resume behavior.

## Done When

- Container tasks are excluded from coordinator execution and rejected by start/implementation events that apply only to executable leaves.
- Parent rollup updates after child status changes, child deletion/attachment changes, and relevant child blockers.
- `all_children_verified` and `synthesis_child_verified` close-out policies are enforced.
- Child retry/resume still uses existing `blocked_external`, `blockedFromStatus`, `retryAfter`, and `retryCount` behavior.
- Parent status and blocked summaries cannot claim a stronger result than child states support.
- Tests cover leaf retry, parent rollup, container start rejection, child deletion guards, and flat-task compatibility.

## Constraints

- Follow RDPI before implementation.
- Depend on the schema/API contract slice rather than redefining hierarchy fields here.
- Do not implement UI hierarchy rendering in this card.
- Do not duplicate audit artifact readiness rules inside generic hierarchy logic.
- Treat manual-review blocking through existing fields/statuses; do not introduce an implicit new status.

## Notes

- The design keeps parent retry/cascade retry deferred until a concrete workflow requires it.

## Links

- Parent design: work-20260513-design-hierarchical-task-model
- Depends on: work-20260513-add-task-hierarchy-schema-api-contract
- Related: work-20260513-bridge-audit-roadmap-batches-to-hierarchy
- Related: work-20260513-plan-b-audit-decomposition-regression-suite
