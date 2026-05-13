# Design Hierarchical Task And Subtask Model

- Task ID: work-20260513-design-hierarchical-task-model
- Lane: work
- Status: queued
- Priority: medium
- Created: 2026-05-13
- Due: unset
- Source: Plan B discussion about parent tasks, subtasks, and nested subtasks
- RDPI Needed: yes
- RDPI Path: unset

## Request

Design the smallest hierarchical task model needed for parent tasks, child tasks, and nested subtasks without breaking the current Kanban, roadmap, and runtime execution model.

The design should decide what belongs in schema, runtime state, API contracts, UI, and RDPI artifacts before implementation tasks are queued.

## Done When

- The design defines parent-child relationships, status rollup, blocking semantics, and close-out rules.
- It explains how child cards are created, resumed, retried, and attached back to a parent.
- It identifies which existing fields can be reused and which schema changes are unavoidable.
- It covers nested subtasks only to the depth needed for current Plan B audit decomposition.
- It produces follow-up implementation cards rather than bundling the full hierarchy into one change.

## Constraints

- This is a design/planning task unless implementation is explicitly queued later.
- Follow RDPI before implementation.
- Do not introduce broad schema changes during intake.
- Keep the model compatible with non-audit workflows.

## Notes

- This is the safer design track for the user's "task -> subtasks -> sub-subtasks" proposal.

## Links

- Related: work-20260513-split-broad-audit-requests-into-micro-report-cards
- Related: work-20260513-define-workflow-contract-pack-interface
