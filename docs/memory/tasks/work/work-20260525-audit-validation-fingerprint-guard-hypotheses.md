<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

---

memory_id: task::aif-handoff::work::work-20260525-audit-validation-fingerprint-guard::hypotheses
project_id: project::aif-handoff
repo_name: aif-handoff
lane: work
task_id: work-20260525-audit-validation-fingerprint-guard
source_path: docs/rdpi/work/work-20260525-audit-validation-fingerprint-guard
stability: draft
sensitivity: forbidden
kind: hypothesis
project: aif-handoff
entity: aif-handoff
scope: task
updated_at: 2026-05-25
supersedes:
expires_at:
tags:

- aif-handoff
- aif-handoff
- aif-handoff
- work
- hypothesis
  source_refs:
- docs/rdpi/work/work-20260525-audit-validation-fingerprint-guard/research.md
- docs/rdpi/work/work-20260525-audit-validation-fingerprint-guard/design.md
- docs/rdpi/work/work-20260525-audit-validation-fingerprint-guard/plan.md
- docs/rdpi/work/work-20260525-audit-validation-fingerprint-guard/result.md
  created_at: 2026-05-25
  last_verified_at: 2026-05-25

---

# Summary

Local-only hypotheses collected during task work-20260525-audit-validation-fingerprint-guard.

# Why it matters

Preserves open questions for follow-up without promoting them into shared memory.

# When to reuse

Reuse only while the task is still active or under review.

# When not to reuse

Do not publish or treat these hypotheses as validated facts.

## Hypotheses

- H1: A fingerprint built from validator kind, repair mode, source classification, manifest status, sorted issue codes, and stable blocking issue descriptors is enough to detect unchanged failures without depending on repeated tool-call counts.
- H2: The runtime adapter can track `validate_audit_report` failure fingerprints within one execution attempt. If the fingerprint repeats, it can return a deterministic terminal result before another generic model turn.
- H3: Deterministic routing can remain additive: source-inconclusive and operator-input outcomes stay in implementer/coordinator paths, bounded deterministic repair stays where current repair logic already exists, and repeated unchanged validator failures stop generic repair in the runtime.
