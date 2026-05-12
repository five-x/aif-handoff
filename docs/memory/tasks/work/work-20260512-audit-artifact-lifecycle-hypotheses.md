<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

---

memory_id: task::aif-handoff::work::work-20260512-audit-artifact-lifecycle::hypotheses
project_id: project::aif-handoff
repo_name: aif-handoff
lane: work
task_id: work-20260512-audit-artifact-lifecycle
source_path: docs/rdpi/work/work-20260512-audit-artifact-lifecycle
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
- docs/rdpi/work/work-20260512-audit-artifact-lifecycle/research.md
- docs/rdpi/work/work-20260512-audit-artifact-lifecycle/design.md
- docs/rdpi/work/work-20260512-audit-artifact-lifecycle/plan.md
- docs/rdpi/work/work-20260512-audit-artifact-lifecycle/result.md
  created_at: 2026-05-12
  last_verified_at: 2026-05-12

---

# Summary

Local-only hypotheses collected during task work-20260512-audit-artifact-lifecycle.

# Why it matters

Preserves open questions for follow-up without promoting them into shared memory.

# When to reuse

Reuse only while the task is still active or under review.

# When not to reuse

Do not publish or treat these hypotheses as validated facts.

## Hypotheses

- H1: A small append-only `roadmap_batch_artifact_attempts` table is the cleanest migration path because it preserves current artifact rows as the latest-state read model while making attempts reviewable and queryable.
- H2: New first-class artifact states should be additive and compatibility-safe: `source_inconclusive`, `terminal_inconclusive`, and `manual_exception`, while preserving existing state names.
- H3: Attempt records should capture `attemptNumber`, `contentSha`, classification outcome, failure family, timestamp, validation details, and rework status.
- H4: Retryable invalid/inconclusive source attempts should not make a batch synthesis-ready. Synthesis should become ready only when source reports are trusted valid, legacy/terminal current rows, explicitly terminalized inconclusive, external-blocked, or manual-exception terminal.
- H5: Repeated same-failure attempts need deterministic failure signatures independent of `contentSha`; content SHA must be recorded for provenance but cannot be part of the retry-loop signature because weak reports may be rewritten while preserving the same failure class.
- H6: Manual exception handling must be explicit and auditable: no artifact should be converted to trusted valid by human override, and prior classifier failure details must remain in the attempt history.
- H7: Rework needs an explicit attempt boundary or generation marker. Without it, stale completion evidence from an older run can overwrite a newer rework boundary or mark a reopened artifact valid.
