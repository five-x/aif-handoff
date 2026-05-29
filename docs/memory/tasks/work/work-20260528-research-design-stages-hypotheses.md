<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

---

memory_id: task::aif-handoff::work::work-20260528-research-design-stages::hypotheses
project_id: project::aif-handoff
repo_name: aif-handoff
lane: work
task_id: work-20260528-research-design-stages
source_path: docs/rdpi/work/work-20260528-research-design-stages
stability: draft
sensitivity: forbidden
kind: hypothesis
project: aif-handoff
entity: aif-handoff
scope: task
updated_at: 2026-05-28
supersedes:
expires_at:
tags:

- aif-handoff
- aif-handoff
- aif-handoff
- work
- hypothesis
  source_refs:
- docs/rdpi/work/work-20260528-research-design-stages/research.md
- docs/rdpi/work/work-20260528-research-design-stages/design.md
- docs/rdpi/work/work-20260528-research-design-stages/plan.md
- docs/rdpi/work/work-20260528-research-design-stages/result.md
  created_at: 2026-05-28
  last_verified_at: 2026-05-28

---

# Summary

Local-only hypotheses collected during task work-20260528-research-design-stages.

# Why it matters

Preserves open questions for follow-up without promoting them into shared memory.

# When to reuse

Reuse only while the task is still active or under review.

# When not to reuse

Do not publish or treat these hypotheses as validated facts.

## Hypotheses

- Adding statuses requires updating shared status config/order, active pipeline counting, coordinator candidate queries, task resume mapping, UI board grouping, and affected tests.
- The narrowest runner implementation can share a generic research/design stage runner helper while keeping two coordinator labels and stage-specific prompts.
- Prompt context should include upstream stage artifacts by lifecycle order, not only exact-stage artifacts.
