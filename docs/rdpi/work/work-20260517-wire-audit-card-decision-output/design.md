# Design

## Chosen design

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

## Pre-PLAN boundary

- Planning artifacts may record local code facts, accepted docs, scope boundaries, hypotheses, and verification plans.
- No implementation, test execution, runtime endpoint checks, scheduler/log probing, or shared-memory server recall before `PLAN PASS`.

## Decision candidates

- Reusable decision: audit-card final status is derived from OTZ acceptance and verification via `classifyAuditCardDecision()`, not directly from weak/discarded source finding quality.
- Reusable decision: weak/discarded findings are diagnostic evidence quality metadata; they must remain visible but cannot by themselves trigger rework, external blocking, `source_inconclusive`, `weak_sources`, or manual review.
