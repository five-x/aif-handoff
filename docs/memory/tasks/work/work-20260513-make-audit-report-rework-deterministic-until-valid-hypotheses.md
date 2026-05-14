<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

---

memory_id: task::aif-handoff::work::work-20260513-make-audit-report-rework-deterministic-until-valid::hypotheses
project_id: project::aif-handoff
repo_name: aif-handoff
lane: work
task_id: work-20260513-make-audit-report-rework-deterministic-until-valid
source_path: docs/rdpi/work/work-20260513-make-audit-report-rework-deterministic-until-valid
stability: draft
sensitivity: forbidden
kind: hypothesis
project: aif-handoff
entity: aif-handoff
scope: task
updated_at: 2026-05-14
supersedes:
expires_at:
tags:

- aif-handoff
- aif-handoff
- aif-handoff
- work
- hypothesis
  source_refs:
- docs/rdpi/work/work-20260513-make-audit-report-rework-deterministic-until-valid/research.md
- docs/rdpi/work/work-20260513-make-audit-report-rework-deterministic-until-valid/design.md
- docs/rdpi/work/work-20260513-make-audit-report-rework-deterministic-until-valid/plan.md
- docs/rdpi/work/work-20260513-make-audit-report-rework-deterministic-until-valid/result.md
  created_at: 2026-05-14
  last_verified_at: 2026-05-14

---

# Summary

Local-only hypotheses collected during task work-20260513-make-audit-report-rework-deterministic-until-valid.

# Why it matters

Preserves open questions for follow-up without promoting them into shared memory.

# When to reuse

Reuse only while the task is still active or under review.

# When not to reuse

Do not publish or treat these hypotheses as validated facts.

## Hypotheses

- Adding a full-context post-repair validation helper in `implementer.ts` can close the gap without broad data-layer or validator changes.
- Replacing the repeated deterministic repair runtime fallthrough with explicit terminalization will satisfy the "general LLM is not final authority" requirement with minimal blast radius.
- Tests can stay mostly in `packages/agent/src/__tests__/implementer.test.ts`, with one shared validator test for placeholder manifest rejection if existing coverage is insufficient.
