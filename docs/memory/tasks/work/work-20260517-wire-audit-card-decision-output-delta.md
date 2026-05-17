<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

---

memory_id: task::aif-handoff::work::work-20260517-wire-audit-card-decision-output::delta
project_id: project::aif-handoff
repo_name: aif-handoff
lane: work
task_id: work-20260517-wire-audit-card-decision-output
source_path: docs/rdpi/work/work-20260517-wire-audit-card-decision-output
stability: validated
sensitivity: local-only
kind: artifact
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
- task-delta
  source_refs:
- docs/rdpi/work/work-20260517-wire-audit-card-decision-output/research.md
- docs/rdpi/work/work-20260517-wire-audit-card-decision-output/design.md
- docs/rdpi/work/work-20260517-wire-audit-card-decision-output/plan.md
- docs/rdpi/work/work-20260517-wire-audit-card-decision-output/result.md
  created_at: 2026-05-17
  last_verified_at: 2026-05-17

---

# Summary

Curated delta for task work-20260517-wire-audit-card-decision-output.

# Why it matters

Keeps the reusable task outcome in one reviewable place before publication.

# When to reuse

Reuse this document when checking what was learned from this task.

# When not to reuse

Do not treat task-local implementation details as cross-project guidance unless they were promoted into decisions or patterns.

## Facts

- none

## Decisions

- Reusable decision: audit-card final status is derived from OTZ acceptance and verification via `classifyAuditCardDecision()`, not directly from weak/discarded source finding quality.
- Reusable decision: weak/discarded findings are diagnostic evidence quality metadata; they must remain visible but cannot by themselves trigger rework, external blocking, `source_inconclusive`, `weak_sources`, or manual review.
- Treat `classifyAuditCardDecision()` as the final audit-card decision layer, while keeping strict evidence validation as the gate that decides whether an artifact is acceptable.
- Add a small shared derivation path that converts accepted audit completion evidence and report text into an `AuditCardDecision`:
- OTZ acceptance is satisfied only when `evaluateTaskCompletionEvidence()` is ok for the audit artifact.
- Verification strength is `verified` for accepted committed evidence, `missing` for missing verification, `inaccessible` for access/external/manual exception conditions, and `missing_production` only when an explicit production-validation residual risk is recorded.
- Valid findings and weak/discarded findings remain separate counters in `auditFindingValidity`.
- Weak/discarded sections do not change `finalStatus`; only OTZ acceptance, verification/access, and residual production risk do.
- Persist the returned decision object in existing roadmap artifact `validationDetails` under `auditCardDecision` when coordinator/API accept an audit artifact.
- Expose that persisted decision through `TaskArtifactTrustRollup.auditCardDecision` and workflow timeline artifact/claim metadata. This keeps the UI/API/report on the same decision object and avoids a new migration.
- Update deterministic report generation so the Card Decision Matrix includes all required fields:
- `requirementCompletion`
- `verificationStrength`
- `auditFindingValidity`
- `residualRisks`
- `finalStatus`
- Add a dedicated `## Weak/discarded findings` section to deterministic synthesis output for weak/discarded finding sections that were omitted from valid source reports. This section is diagnostic only and does not feed final status.
- Update UI components to render `auditCardDecision` from `task.artifactTrust`, including final status and required detail fields. Manual review display continues to depend on `task.manualReviewRequired`, not weak-finding presence.

## Patterns

- Persist semantic audit decisions in artifact validation details, then project them through the existing artifact trust/timeline surfaces. Avoid duplicating final decision logic in UI code.
