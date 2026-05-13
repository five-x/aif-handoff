# Add Task Hierarchy Schema And API Contract

- Task ID: work-20260513-add-task-hierarchy-schema-api-contract
- Lane: work
- Status: queued
- Priority: high
- Created: 2026-05-13
- Due: unset
- Source: work-20260513-design-hierarchical-task-model RDPI
- RDPI Needed: yes
- RDPI Path: docs/rdpi/work/work-20260513-add-task-hierarchy-schema-api-contract

## Request

Implement the first task hierarchy persistence and API contract slice.

Add first-class task hierarchy fields for parent task, root task, hierarchy depth, hierarchy role, sibling hierarchy position, and parent close-out policy. Extend shared types, database migrations, data repository helpers, API create/update/read/list contracts, and MCP task-tool parity as needed.

## Done When

- The task schema and migrations include hierarchy fields without replacing the existing flat task lifecycle.
- Create/update validation rejects cross-project parents, cycles, unsupported depth, invalid roles, and invalid close-out policies.
- API responses expose hierarchy fields and a minimal derived child summary.
- Existing non-hierarchical tasks remain compatible and need no data backfill beyond safe defaults.
- MCP task tools have hierarchy contract parity or an explicit documented follow-up if parity cannot fit this slice.
- Focused tests cover schema migration, type mapping, create/update validation, and flat-task compatibility.

## Constraints

- Follow RDPI before implementation.
- Do not implement runtime rollup, UI hierarchy rendering, or audit-roadmap bridging in this card except for fields needed by the contract.
- Keep maximum supported hierarchy depth at 2.
- Keep `TaskStatus` unchanged unless a later RDPI task proves a new status is unavoidable.
- Do not use tags or `roadmapAlias` as the hierarchy source of truth.

## Notes

- Parent containers are coordination surfaces; leaf children remain the runtime execution unit.
- Existing tags and roadmap aliases may remain display/filter metadata.

## Links

- Parent design: work-20260513-design-hierarchical-task-model
- Follow-up: work-20260513-enforce-hierarchy-rollup-runtime-gates
- Follow-up: work-20260513-surface-task-hierarchy-in-ui
- Follow-up: work-20260513-bridge-audit-roadmap-batches-to-hierarchy
