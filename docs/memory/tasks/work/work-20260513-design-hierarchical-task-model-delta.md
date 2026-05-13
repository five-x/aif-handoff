<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

---

memory_id: task::aif-handoff::work::work-20260513-design-hierarchical-task-model::delta
project_id: project::aif-handoff
repo_name: aif-handoff
lane: work
task_id: work-20260513-design-hierarchical-task-model
source_path: docs/rdpi/work/work-20260513-design-hierarchical-task-model
stability: validated
sensitivity: local-only
kind: artifact
project: aif-handoff
entity: aif-handoff
scope: task
updated_at: 2026-05-13
supersedes:
expires_at:
tags:

- aif-handoff
- aif-handoff
- aif-handoff
- work
- task-delta
  source_refs:
- docs/rdpi/work/work-20260513-design-hierarchical-task-model/research.md
- docs/rdpi/work/work-20260513-design-hierarchical-task-model/design.md
- docs/rdpi/work/work-20260513-design-hierarchical-task-model/plan.md
- docs/rdpi/work/work-20260513-design-hierarchical-task-model/result.md
  created_at: 2026-05-13
  last_verified_at: 2026-05-13

---

# Summary

Curated delta for task work-20260513-design-hierarchical-task-model.

# Why it matters

Keeps the reusable task outcome in one reviewable place before publication.

# When to reuse

Reuse this document when checking what was learned from this task.

# When not to reuse

Do not treat task-local implementation details as cross-project guidance unless they were promoted into decisions or patterns.

## Facts

- none

## Decisions

- Parent tasks are coordination containers; leaf children remain the runtime execution unit.
- Generic hierarchy uses first-class task fields, not tags or roadmap aliases.
- Generic hierarchy has max depth `2` until a real workflow requires deeper nesting.
- Audit roadmap batches remain the artifact readiness contract; hierarchy only attaches the generated cards to a parent.

## Patterns

- Keep generic hierarchy in core task fields, and keep workflow-specific artifact readiness in workflow-specific contracts.
- Use parent containers as coordination surfaces until there is a concrete requirement for executable parents.
- Queue implementation slices from design tasks; do not execute child implementation tasks in the same RDPI run.
