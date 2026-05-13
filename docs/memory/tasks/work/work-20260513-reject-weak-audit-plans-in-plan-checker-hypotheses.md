<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

---

memory_id: task::aif-handoff::work::work-20260513-reject-weak-audit-plans-in-plan-checker::hypotheses
project_id: project::aif-handoff
repo_name: aif-handoff
lane: work
task_id: work-20260513-reject-weak-audit-plans-in-plan-checker
source_path: docs/rdpi/work/work-20260513-reject-weak-audit-plans-in-plan-checker
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
- docs/rdpi/work/work-20260513-reject-weak-audit-plans-in-plan-checker/research.md
- docs/rdpi/work/work-20260513-reject-weak-audit-plans-in-plan-checker/design.md
- docs/rdpi/work/work-20260513-reject-weak-audit-plans-in-plan-checker/plan.md
- docs/rdpi/work/work-20260513-reject-weak-audit-plans-in-plan-checker/result.md
  created_at: 2026-05-13
  last_verified_at: 2026-05-13

---

# Summary

Local-only hypotheses collected during task work-20260513-reject-weak-audit-plans-in-plan-checker.

# Why it matters

Preserves open questions for follow-up without promoting them into shared memory.

# When to reuse

Reuse only while the task is still active or under review.

# When not to reuse

Do not publish or treat these hypotheses as validated facts.

## Hypotheses

- H1: Adding audit-specific issue codes to `evaluateTaskPlanQuality()` can fail weak audit plans before implementation without affecting non-audit workflow plans.
- H2: Reusing `classifyAuditDecompositionRequest()` lets the plan checker reject broad audit plans without inventing a second broadness heuristic.
- H3: A narrow audit plan can pass when it has one concrete report artifact, scoped evidence targets, explicit exclusions, expected report structure, and a clear "no child reports required" decision.
- H4: A decomposed audit plan can pass when it declares child/source report artifacts, synthesis output, scoped evidence targets for the child reports, explicit exclusions, and expected report structure.
- H5: Updating deterministic diagnostic fallback output to include exclusions and child-report decisions will keep recovery for malformed narrow diagnostic plans while still failing broad plans that require decomposition.
