<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

---

memory_id: task::aif-handoff::work::work-20260517-wire-audit-card-decision-output::hypotheses
project_id: project::aif-handoff
repo_name: aif-handoff
lane: work
task_id: work-20260517-wire-audit-card-decision-output
source_path: docs/rdpi/work/work-20260517-wire-audit-card-decision-output
stability: draft
sensitivity: forbidden
kind: hypothesis
project: aif-handoff
entity: aif-handoff
scope: task
updated_at: 2026-05-17
supersedes:
expires_at:
tags:

- aif-handoff
- aif-handoff
- aif-handoff
- work
- hypothesis
  source_refs:
- docs/rdpi/work/work-20260517-wire-audit-card-decision-output/research.md
- docs/rdpi/work/work-20260517-wire-audit-card-decision-output/design.md
- docs/rdpi/work/work-20260517-wire-audit-card-decision-output/plan.md
- docs/rdpi/work/work-20260517-wire-audit-card-decision-output/result.md
  created_at: 2026-05-17
  last_verified_at: 2026-05-17

---

# Summary

Local-only hypotheses collected during task work-20260517-wire-audit-card-decision-output.

# Why it matters

Preserves open questions for follow-up without promoting them into shared memory.

# When to reuse

Reuse only while the task is still active or under review.

# When not to reuse

Do not publish or treat these hypotheses as validated facts.

## Hypotheses

- Persisting `auditCardDecision` in validation details when an audit artifact is accepted, then projecting it through `buildTaskArtifactTrustRollup()` and workflow timeline metadata, will make the real UI/API/report consume `classifyAuditCardDecision()` without changing the database schema.
- Expanding the deterministic report card matrix to include `requirementCompletion` and `verificationStrength`, and adding a weak/discarded findings section for omitted weak findings, will satisfy the report-output part of the request.
- A coordinator-level regression can be built with a committed valid audit report artifact containing `No validated findings` plus `## Weak/discarded findings`; after the reviewer gate accepts, the task should be `done`, artifact trust should expose `auditCardDecision.finalStatus = "closed_verified"`, and `manualReviewRequired` should remain false.
