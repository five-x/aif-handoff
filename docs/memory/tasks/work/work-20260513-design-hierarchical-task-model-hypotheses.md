<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

---

memory_id: task::aif-handoff::work::work-20260513-design-hierarchical-task-model::hypotheses
project_id: project::aif-handoff
repo_name: aif-handoff
lane: work
task_id: work-20260513-design-hierarchical-task-model
source_path: docs/rdpi/work/work-20260513-design-hierarchical-task-model
stability: draft
sensitivity: forbidden
kind: hypothesis
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
- hypothesis
  source_refs:
- docs/rdpi/work/work-20260513-design-hierarchical-task-model/research.md
- docs/rdpi/work/work-20260513-design-hierarchical-task-model/design.md
- docs/rdpi/work/work-20260513-design-hierarchical-task-model/plan.md
- docs/rdpi/work/work-20260513-design-hierarchical-task-model/result.md
  created_at: 2026-05-13
  last_verified_at: 2026-05-13

---

# Summary

Local-only hypotheses collected during task work-20260513-design-hierarchical-task-model.

# Why it matters

Preserves open questions for follow-up without promoting them into shared memory.

# When to reuse

Reuse only while the task is still active or under review.

# When not to reuse

Do not publish or treat these hypotheses as validated facts.

## Hypotheses

- The smallest robust model needs first-class task hierarchy fields on `tasks`, not only tags: parent id, root id, depth, child ordering, role, and close-out policy.
- Existing `TaskStatus` values can be reused for both leaf execution and parent rollup; a new status enum is not needed for the first slice.
- Existing `blockedReason`, `blockedFromStatus`, `paused`, and retry fields can continue to model leaf retry and external blockers. Parent retry should be driven by child retry until a real parent-execution requirement appears.
- Plan B audit decomposition can use a generic parent container while keeping roadmap batch artifacts as the authoritative source/synthesis evidence contract.
- A max depth of two child levels, root -> child -> grandchild, is enough for the current task -> subtasks -> sub-subtasks proposal and avoids premature closure-table work.
