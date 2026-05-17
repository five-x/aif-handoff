# Harden Audit Report Runtime Rework Boundary

- Task ID: work-20260515-harden-audit-report-runtime-rework
- Lane: work
- Status: queued
- Priority: critical
- Created: 2026-05-15
- Due: before continuing audit-v16
- Source: audit-v16 live canary task `ca78dcd8-61a2-4a76-b049-fd49a8f70136` blocked correctly instead of reaching `done`, but runtime audit report rework produced an invalid manifest and inventory-only evidence after deterministic repair failed
- RDPI Needed: yes
- RDPI Path: docs/rdpi/work/work-20260515-harden-audit-report-runtime-rework

## Request

Fix the audit report production and rework boundary so strict audit report artifacts are not hand-authored by the runtime model after deterministic repair cannot satisfy the validator.

The immediate protective behavior should be fail-closed: deterministic audit report repair either emits a validator-valid report artifact or terminalizes the source report as `source_inconclusive`. Runtime/model rewrite must not be able to create or claim a repaired `audit-report-manifest` that still fails `invalid_report_manifest`, `missing_scope_coverage`, `missing_substantive_evidence`, or related strict validator checks.

## Done When

- A strict audit report artifact cannot be routed to free-form runtime rework after deterministic repair fails validator requirements.
- Deterministic repair creates the `audit-report-manifest` with structured code, valid JSON, real `contentSha256`, source snapshot fields, scope coverage, risk hypotheses, findings or no-findings claims, and ledger-bound `evidenceRefs`.
- If deterministic repair cannot gather substantive evidence for declared scope/risk hypotheses, the source artifact becomes terminal `source_inconclusive`, not `done` and not runtime-rewritten markdown.
- Runtime implementer prompts cannot ask the model to hand-author or patch `audit-report-manifest` for strict audit reports.
- Reviewer output cannot close `invalid_report_manifest`, `missing_scope_coverage`, `missing_substantive_evidence`, or deterministic repair blocker IDs unless validator evidence proves the artifact is valid.
- Regression tests cover the audit-v16 failure shape: malformed manifest JSON, placeholder hash/snapshot, inventory-only evidence, repeated runtime rewrite, and reviewer claiming `resolved`.
- Auto-queue behavior remains fail-closed: blocked/terminal invalid source artifacts do not become successful synthesis input.

## Constraints

- Do not weaken audit validators.
- Do not accept inventory-only no-findings reports as trusted.
- Do not patch live audit-v16 cards as part of intake.
- Do not create or execute child implementation work in the same run that creates this task.
- Preserve operator diagnostics: exact validator issue codes, artifact path, finding IDs, and next action.

## Notes

- The prior exact-rework-closure fix worked for this canary: the task stopped at `blocked_external` with `manualReviewRequired=true` instead of false `done`.
- The remaining defect is artifact production quality and the unsafe runtime fallback that lets the model rewrite strict manifest-bearing reports.
