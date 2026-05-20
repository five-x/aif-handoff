<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

---

memory_id: task::aif-handoff::work::work-20260519-enforce-non-green-inconclusive-lifecycle::hypotheses
project_id: project::aif-handoff
repo_name: aif-handoff
lane: work
task_id: work-20260519-enforce-non-green-inconclusive-lifecycle
source_path: docs/rdpi/work/work-20260519-enforce-non-green-inconclusive-lifecycle
stability: draft
sensitivity: forbidden
kind: hypothesis
project: aif-handoff
entity: aif-handoff
scope: task
updated_at: 2026-05-19
supersedes:
expires_at:
tags:

- aif-handoff
- aif-handoff
- aif-handoff
- work
- hypothesis
  source_refs:
- docs/rdpi/work/work-20260519-enforce-non-green-inconclusive-lifecycle/research.md
- docs/rdpi/work/work-20260519-enforce-non-green-inconclusive-lifecycle/design.md
- docs/rdpi/work/work-20260519-enforce-non-green-inconclusive-lifecycle/plan.md
- docs/rdpi/work/work-20260519-enforce-non-green-inconclusive-lifecycle/result.md
  created_at: 2026-05-19
  last_verified_at: 2026-05-19

---

# Summary

Local-only hypotheses collected during task work-20260519-enforce-non-green-inconclusive-lifecycle.

# Why it matters

Preserves open questions for follow-up without promoting them into shared memory.

# When to reuse

Reuse only while the task is still active or under review.

# When not to reuse

Do not publish or treat these hypotheses as validated facts.

## Hypotheses

- A shared audit-card decision helper can replace the duplicated coordinator/API decision logic without changing public decision shape.
- Explicit audit-inconclusive synthesis should fail completion evidence with `audit_inconclusive`, causing coordinator/API paths to use the existing block/rework machinery instead of artifact `valid`.
- Source-inconclusive terminalization should keep artifact `source_inconclusive` but set the task to a non-green blocked hold with preserved blocker fields.
- Data projection should defensively downgrade legacy `valid` + `audit_inconclusive` synthesis to untrusted/non-green so old rows cannot still render green.
- The weak/discarded no-findings regression can stay green because the weak/discarded sections are already parsed separately by `auditCardDecision` and validated by shared completion evidence tests.
