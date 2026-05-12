<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

---

memory_id: task::aif-handoff::work::work-20260512-audit-evidence-provenance-contract::hypotheses
project_id: project::aif-handoff
repo_name: aif-handoff
lane: work
task_id: work-20260512-audit-evidence-provenance-contract
source_path: docs/rdpi/work/work-20260512-audit-evidence-provenance-contract
stability: draft
sensitivity: forbidden
kind: hypothesis
project: aif-handoff
entity: aif-handoff
scope: task
updated_at: 2026-05-12
supersedes:
expires_at:
tags:

- aif-handoff
- aif-handoff
- aif-handoff
- work
- hypothesis
  source_refs:
- docs/rdpi/work/work-20260512-audit-evidence-provenance-contract/research.md
- docs/rdpi/work/work-20260512-audit-evidence-provenance-contract/design.md
- docs/rdpi/work/work-20260512-audit-evidence-provenance-contract/plan.md
- docs/rdpi/work/work-20260512-audit-evidence-provenance-contract/result.md
  created_at: 2026-05-12
  last_verified_at: 2026-05-12

---

# Summary

Local-only hypotheses collected during task work-20260512-audit-evidence-provenance-contract.

# Why it matters

Preserves open questions for follow-up without promoting them into shared memory.

# When to reuse

Reuse only while the task is still active or under review.

# When not to reuse

Do not publish or treat these hypotheses as validated facts.

## Hypotheses

- H1: A durable `docs/kb/` contract is the correct implementation surface for this task because the intake asks to define architecture, migration order, and immediate containment boundaries, while separately constraining runtime logging/schema changes.
- H2: Immediate containment should preserve the current `auditReportValidator`, `auditSynthesisClassifier`, completion evidence, review gate, and roadmap failure-family behavior without broad runtime rewrites.
- H3: Future evidence-ledger work should introduce structured runtime evidence units and source snapshot IDs first, then move source report manifests and batch classifiers onto that provenance instead of trusting markdown alone.
- H4: The shared classification vocabulary should be wider than the current three synthesis outcomes so source-level invalidity and terminal batch inconclusiveness can be represented without overloading `inconclusive_batch_evidence`.
- H5: `validationDetailsJson` is the safest compatibility extension point during migration, but first-class schema fields are needed before provenance can become authoritative.
