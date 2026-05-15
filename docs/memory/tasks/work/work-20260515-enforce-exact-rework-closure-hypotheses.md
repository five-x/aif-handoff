<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

---

memory_id: task::aif-handoff::work::work-20260515-enforce-exact-rework-closure::hypotheses
project_id: project::aif-handoff
repo_name: aif-handoff
lane: work
task_id: work-20260515-enforce-exact-rework-closure
source_path: docs/rdpi/work/work-20260515-enforce-exact-rework-closure
stability: draft
sensitivity: forbidden
kind: hypothesis
project: aif-handoff
entity: aif-handoff
scope: task
updated_at: 2026-05-15
supersedes:
expires_at:
tags:

- aif-handoff
- aif-handoff
- aif-handoff
- work
- hypothesis
  source_refs:
- docs/rdpi/work/work-20260515-enforce-exact-rework-closure/research.md
- docs/rdpi/work/work-20260515-enforce-exact-rework-closure/design.md
- docs/rdpi/work/work-20260515-enforce-exact-rework-closure/plan.md
- docs/rdpi/work/work-20260515-enforce-exact-rework-closure/result.md
  created_at: 2026-05-15
  last_verified_at: 2026-05-15

---

# Summary

Local-only hypotheses collected during task work-20260515-enforce-exact-rework-closure.

# Why it matters

Preserves open questions for follow-up without promoting them into shared memory.

# When to reuse

Reuse only while the task is still active or under review.

# When not to reuse

Do not publish or treat these hypotheses as validated facts.

## Hypotheses

- Converting manual-review and terminal-inconclusive unresolved paths from `done` to `blocked_external` will make `done` represent only accepted review/completion evidence paths.
- Tightening implementer/reviewer prompt contracts will reduce weak rework attempts without changing validators.
- Targeted coordinator/review gate tests can cover the task card's required cases without broad fixture churn.
