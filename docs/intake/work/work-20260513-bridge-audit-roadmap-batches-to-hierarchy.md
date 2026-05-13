# Bridge Audit Roadmap Batches To Hierarchy

- Task ID: work-20260513-bridge-audit-roadmap-batches-to-hierarchy
- Lane: work
- Status: queued
- Priority: high
- Created: 2026-05-13
- Due: unset
- Source: work-20260513-design-hierarchical-task-model RDPI
- RDPI Needed: yes
- RDPI Path: docs/rdpi/work/work-20260513-bridge-audit-roadmap-batches-to-hierarchy

## Request

Attach broad audit roadmap batches to the generic task hierarchy model while preserving existing audit artifact readiness semantics.

Roadmap generation/import should create or use a root audit container, attach source report tasks and the synthesis task as children, keep `roadmap_batches` and `roadmap_batch_artifacts` authoritative for artifact attempts/readiness, and close the parent through the synthesis child.

## Done When

- Audit roadmap import creates a hierarchy root container or attaches to an explicit parent contract.
- Source report tasks and the synthesis task are children of the audit parent.
- The parent uses `synthesis_child_verified` close-out policy.
- Existing `synthesis_not_ready` pause/block behavior continues to come from roadmap batch readiness.
- Source inconclusive, invalid, missing, external-blocked, and trusted-valid artifact states are not duplicated as generic hierarchy states.
- Tests cover broad audit parent creation, child attachment, synthesis child policy, and non-audit roadmap compatibility.

## Constraints

- Follow RDPI before implementation.
- Depend on the schema/API and runtime rollup slices where possible.
- Do not weaken existing audit report, synthesis, evidence, or artifact validators.
- Do not execute broad audit child implementation tasks in this card.

## Notes

- This is the Plan B bridge from audit batch decomposition to generic parent/child visibility.

## Links

- Parent design: work-20260513-design-hierarchical-task-model
- Related: work-20260513-split-broad-audit-requests-into-micro-report-cards
- Related: work-20260513-plan-b-audit-decomposition-regression-suite
- Depends on: work-20260513-add-task-hierarchy-schema-api-contract
- Depends on: work-20260513-enforce-hierarchy-rollup-runtime-gates
