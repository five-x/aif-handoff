<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

---

memory_id: task::aif-handoff::work::work-20260515-enforce-exact-rework-closure::entity-capsule
project_id: project::aif-handoff
repo_name: aif-handoff
lane: work
task_id: work-20260515-enforce-exact-rework-closure
source_path: docs/rdpi/work/work-20260515-enforce-exact-rework-closure
stability: stable
sensitivity: local-only
kind: capsule
project: aif-handoff
entity: aif-handoff
scope: project
updated_at: 2026-05-15
supersedes:
expires_at:
tags:

- aif-handoff
- aif-handoff
- aif-handoff
- work
- capsule
  source_refs:
- docs/rdpi/work/work-20260515-enforce-exact-rework-closure/research.md
- docs/rdpi/work/work-20260515-enforce-exact-rework-closure/design.md
- docs/rdpi/work/work-20260515-enforce-exact-rework-closure/plan.md
- docs/rdpi/work/work-20260515-enforce-exact-rework-closure/result.md
  created_at: 2026-05-15
  last_verified_at: 2026-05-15

---

# Summary

Current capsule for entity aif-handoff, refreshed by task work-20260515-enforce-exact-rework-closure.

# Why it matters

Makes entity-level recall cheaper and more consistent.

# When to reuse

Reuse before editing the same component or domain.

# When not to reuse

Do not reuse if the entity boundary or ownership changed.

## Active decisions

- Keep `done` for accepted review plus passing completion evidence.
- Move unresolved manual-review outcomes to `blocked_external` with `manualReviewRequired=true`.
- Change roadmap source-report inconclusive terminalization from task `done` to `blocked_external` while preserving artifact `source_inconclusive` diagnostics.
- Preserve exact unresolved finding IDs in `blockedReason`, `autoReviewState`, artifact validation details, and activity log.
- Keep audit/report validators strict and additive; do not downgrade validation failures into successful completion.
