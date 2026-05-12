# Define Audit Evidence Provenance Contract

- Task ID: work-20260512-audit-evidence-provenance-contract
- Lane: work
- Status: done
- Priority: high
- Created: 2026-05-12
- Due: unset
- Source: follow-up from repeated audit-v8/audit-v9 inventory-only no-findings source reports reaching final synthesis
- RDPI Needed: yes
- RDPI Path: docs/rdpi/work/work-20260512-audit-evidence-provenance-contract

## Request

Define the target audit trust contract so source audit reports are trusted only when conclusions are backed by declared scope, risk hypotheses, source snapshot binding, runtime-captured evidence units, and shared conclusion rules.

This task is the architecture and migration contract for moving audit from markdown plausibility checks to an evidence-provenance lifecycle. It should define domain boundaries for AuditPlan, SourceSnapshot, EvidenceLedger, AuditReportManifest, AuditReportClassifier, and AuditBatchClassifier.

## Done When

- The audit pipeline has documented invariants for trusted source reports and no-findings claims.
- Inventory evidence is explicitly classified as discovery-only and cannot prove absence of scoped risk.
- Shared classification vocabulary is defined for valid findings, valid no-findings, inventory-only invalid, insufficient substantive evidence, source inconclusive, and terminal inconclusive.
- State transition rules are specified for source report artifacts and audit batches.
- Compatibility and rollout order are defined so existing markdown reports can be handled safely during migration.
- The contract identifies which decisions are immediate containment work and which require runtime/evidence ledger changes.

## Constraints

- Follow RDPI before implementation.
- Do not execute this task during intake.
- Do not introduce runtime logging or schema changes until design and plan pass independent review.
- Preserve existing audit synthesis inconclusive gate behavior while designing the new trust boundary.
- Avoid a one-shot rewrite; define staged migration steps.

## Notes

- Current local evidence: `auditReportValidator` receives report text and filesystem context, but no structured evidence ledger or runtime output provenance.
- Current local evidence: `auditSynthesisClassifier` already treats inventory commands such as `git ls-files`, `git status`, `ls`, `find`, and `Get-ChildItem` as inventory-only.
- Current failure class: weak source reports are marked valid upstream, then final synthesis classifies the batch as inconclusive because source reports are inventory-only no-findings.

## Links

- Related completed work: ../../rdpi/work/work-20260511-audit-inconclusive-synthesis-gate
- Related intake: work-20260512-align-source-report-classification
- Related intake: work-20260512-audit-evidence-ledger
