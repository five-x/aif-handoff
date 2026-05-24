<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

---

memory_id: task::aif-handoff::work::work-20260513-enforce-hierarchy-rollup-runtime-gates::delta
project_id: project::aif-handoff
repo_name: aif-handoff
lane: work
task_id: work-20260513-enforce-hierarchy-rollup-runtime-gates
source_path: docs/rdpi/work/work-20260513-enforce-hierarchy-rollup-runtime-gates
stability: validated
sensitivity: local-only
kind: artifact
project: aif-handoff
entity: aif-handoff
scope: task
updated_at: 2026-05-23
supersedes:
expires_at:
tags:

- aif-handoff
- aif-handoff
- aif-handoff
- work
- task-delta
  source_refs:
- docs/rdpi/work/work-20260513-enforce-hierarchy-rollup-runtime-gates/research.md
- docs/rdpi/work/work-20260513-enforce-hierarchy-rollup-runtime-gates/design.md
- docs/rdpi/work/work-20260513-enforce-hierarchy-rollup-runtime-gates/plan.md
- docs/rdpi/work/work-20260513-enforce-hierarchy-rollup-runtime-gates/result.md
  created_at: 2026-05-23
  last_verified_at: 2026-05-23

---

# Summary

Curated delta for task work-20260513-enforce-hierarchy-rollup-runtime-gates.

# Why it matters

Keeps the reusable task outcome in one reviewable place before publication.

# When to reuse

Reuse this document when checking what was learned from this task.

# When not to reuse

Do not treat task-local implementation details as cross-project guidance unless they were promoted into decisions or patterns.

## Facts

- none

## Decisions

- Prefer failing closed over auto-detaching or auto-repairing inconsistent hierarchies.
- Prefer direct-child rollup for this slice; deeper descendant aggregation can be layered later if needed.
- Keep runtime exclusion and rollup enforcement in the data/API service boundary, with the coordinator inheriting container safety through existing data queries.
- Keep `verified` as an explicit human/system approval state, not a rollup result.
- Treat ambiguous `synthesis_child_verified` lookup as unsatisfied instead of guessing.

## Patterns

- Centralize runtime safety in data helpers and API transition guards instead of duplicating coordinator-side checks.
- Keep audit artifact readiness in roadmap batch tables and use hierarchy only for task attachment/rollup.
