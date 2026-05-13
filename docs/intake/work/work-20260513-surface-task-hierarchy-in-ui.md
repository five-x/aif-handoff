# Surface Task Hierarchy In UI

- Task ID: work-20260513-surface-task-hierarchy-in-ui
- Lane: work
- Status: queued
- Priority: medium
- Created: 2026-05-13
- Due: unset
- Source: work-20260513-design-hierarchical-task-model RDPI
- RDPI Needed: yes
- RDPI Path: docs/rdpi/work/work-20260513-surface-task-hierarchy-in-ui

## Request

Expose task hierarchy in the web UI without replacing the current status-first Kanban model.

Show parent containers, child summaries, parent/child navigation, and list indentation while preserving existing roadmap filters, tags, and flat-task workflows.

## Done When

- Kanban cards show useful child summary signals for parent containers.
- Task detail shows child tasks, parent link, child counts, blocked child counts, and verified child counts.
- List view supports hierarchy indentation and parent title/short id context.
- Existing roadmap alias and tag filters continue to work.
- UI does not allow unsafe container execution actions.
- Tests or component-level checks cover flat tasks, parent containers, children, and blocked-child summary rendering.

## Constraints

- Follow RDPI before implementation.
- Prefer visibility and navigation first; defer complex drag-and-drop tree editing.
- Do not use nested cards inside cards or broad decorative UI changes.
- Do not invent hierarchy data client-side when API fields are missing.

## Notes

- This card should land after the hierarchy API fields exist.

## Links

- Parent design: work-20260513-design-hierarchical-task-model
- Depends on: work-20260513-add-task-hierarchy-schema-api-contract
- Related: work-20260513-enforce-hierarchy-rollup-runtime-gates
