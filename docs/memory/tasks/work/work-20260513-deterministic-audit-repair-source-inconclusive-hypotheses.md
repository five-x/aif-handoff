<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

---

memory_id: task::aif-handoff::work::work-20260513-deterministic-audit-repair-source-inconclusive::hypotheses
project_id: project::aif-handoff
repo_name: aif-handoff
lane: work
task_id: work-20260513-deterministic-audit-repair-source-inconclusive
source_path: docs/rdpi/work/work-20260513-deterministic-audit-repair-source-inconclusive
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
- docs/rdpi/work/work-20260513-deterministic-audit-repair-source-inconclusive/research.md
- docs/rdpi/work/work-20260513-deterministic-audit-repair-source-inconclusive/design.md
- docs/rdpi/work/work-20260513-deterministic-audit-repair-source-inconclusive/plan.md
- docs/rdpi/work/work-20260513-deterministic-audit-repair-source-inconclusive/result.md
  created_at: 2026-05-13
  last_verified_at: 2026-05-13

---

# Summary

Local-only hypotheses collected during task work-20260513-deterministic-audit-repair-source-inconclusive.

# Why it matters

Preserves open questions for follow-up without promoting them into shared memory.

# When to reuse

Reuse only while the task is still active or under review.

# When not to reuse

Do not publish or treat these hypotheses as validated facts.

## Hypotheses

- H1: The smallest safe containment is repair-local: classify deterministic repair readiness from task scope, risk hypotheses, selected files, and ledger units before choosing the manifest outcome.
- H2: Missing risk hypotheses, missing concrete scope, broad root fallback, or only hidden tooling evidence should produce a `source_inconclusive` report and artifact state rather than a trusted no-findings report.
- H3: Trusted deterministic no-findings repair should remain possible for narrow, explicit source scope with parseable risk hypotheses and product files, preserving the current safe metadata repair behavior.
- H4: The data-layer trusted count protections should already prevent `source_inconclusive` from incrementing `validArtifactCount` if implementer persists the artifact state as `source_inconclusive` or otherwise avoids `state: "valid"`.
- H5: Tests should verify both artifact content and batch artifact state, because a non-trusted report body alone is insufficient if the artifact row is still marked valid.
