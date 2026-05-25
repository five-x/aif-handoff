# Plan: Ledger-Only Audit Completion Evidence

Plan status: independent `PLAN PASS`.

## Implementation steps

1. Add trusted-mode types and evidence fields in `packages/shared/src/taskCompletionEvidence.ts`.
   - Add `AuditTrustMode = "diagnostic" | "trusted_artifact"`.
   - Add optional `auditTrustMode?: AuditTrustMode` to `TaskCompletionEvidenceInput`.
   - Add `auditTrustMode`, `legacySubstantiveReportEvidence`, and `trustedAuditArtifact` to `TaskCompletionEvidenceResult.evidence`.
   - Derive trusted mode for roadmap audit artifacts when the caller does not explicitly set a mode.

2. Compute strict trusted artifact proof.
   - Require `auditReportValidation.ok`.
   - Require `auditReportValidation.manifestStatus === "valid"`.
   - Require `auditReportValidation.sourceClassification` to be a public trusted outcome, not `source_inconclusive` or `inventory_only_invalid`.
   - Pass an expected trusted source snapshot into report validation and lifecycle revalidation; use `HEAD^` when `HEAD` is a report-artifact-only commit, otherwise use `HEAD`.
   - Require `input.requireAuditLedgerEvidence === true`.
   - Require `auditArtifactLifecycle?.ok === true`.
   - Require `auditArtifactLifecycle.states.artifact_state_valid === true`.
   - Require `auditArtifactLifecycle.committedValidation?.ok === true`.

3. Split diagnostic legacy evidence from trusted completion evidence.
   - Keep `legacySubstantiveReportEvidence` available in evidence output.
   - In diagnostic mode, preserve existing `substantiveReportEvidence` behavior unless tests show it is already too broad.
   - In trusted mode, do not allow `legacySubstantiveReportEvidence` to satisfy trusted completion or implementation-activity bypasses.
   - Ensure trusted no-findings still passes when ledger-backed, manifest-valid, source-snapshot-valid, and committed lifecycle evidence passes.

4. Add reason-code propagation for legacy-only trusted failures.
   - Reuse existing manifest, ledger, snapshot, and lifecycle codes as primary blockers.
   - Add `legacy_text_evidence_untrusted` only when the artifact has legacy/text substantive evidence but lacks strict trusted artifact proof.
   - Ensure this code distinguishes diagnostic legacy evidence from trusted artifact evidence without weakening current low-quality or insufficient-evidence errors.

5. Export public types from `packages/shared/src/index.ts`.
   - Export `AuditTrustMode`.
   - Export any added trusted evidence shape if implemented as a named type.

6. Add focused shared tests.
   - Legacy evidence true with trusted validator false fails in trusted mode and exposes `legacy_text_evidence_untrusted`.
   - Missing ledger in trusted mode fails and does not produce `trustedAuditArtifact`.
   - Placeholder content hash fails through existing manifest hash/code paths.
   - Stale and older-but-valid source snapshots fail through `manifest_source_snapshot_mismatch`.
   - Committed blob pass produces `trustedAuditArtifact: true` and `ok: true`.
   - Diagnostic mode can surface legacy evidence but does not mark `trustedAuditArtifact`.

7. Add or adjust data/API tests only if needed.
   - Run existing data rollup tests to confirm markdown-only, shallow, missing lifecycle, partial lifecycle, and legacy lifecycle rows remain untrusted.
   - Add a data/API assertion only if persisted reason-code behavior changes.

8. Run required verification.
   - `npm.cmd test --workspace=@aif/shared -- --run src/__tests__/taskCompletionEvidence.test.ts src/__tests__/auditReportValidator.test.ts`
   - `npm.cmd test --workspace=@aif/data -- --run src/__tests__/index.test.ts`
   - `npm.cmd test --workspace=@aif/api -- --run src/__tests__/tasks.test.ts` if API or persisted reason-code behavior changes.
   - `npm.cmd run lint`
   - `npm.cmd run build`

9. Complete mandatory RDPI gates.
   - Independent reviewer returns `PLAN PASS` before implementation.
   - Coder implements only this approved plan.
   - Independent tester returns `TEST PASS` after verification.
   - Independent final reviewer returns `REVIEW PASS`.
   - Write `result.md`, run `$memsync MODE=auto LANE=work TASK_ID=work-20260525-ledger-only-audit-completion-evidence`, then update only this task in `docs/intake/work_status.json`.

## Acceptance criteria

- `taskCompletionEvidence` no longer uses `legacySubstantiveReportEvidence` to satisfy trusted audit completion.
- Diagnostic mode may surface legacy/text evidence for operator visibility, but those signals cannot mark trusted audit state valid.
- Trusted mode fails closed when manifest, ledger, source snapshot, or committed blob verification is missing.
- Reason codes distinguish legacy/text-only evidence from trusted artifact evidence.
- Tests cover legacy evidence true with trusted validator false, missing ledger in trusted mode, placeholder hash, stale snapshot, and committed blob pass.

## Guardrails

- Preserve public audit outcome vocabulary: `validated_findings_present`, `validated_no_findings`, and `source_inconclusive`.
- Do not make trusted no-findings impossible.
- Do not weaken existing manifest, ledger, source snapshot, scope/risk, or committed lifecycle checks.
- Do not run local AIF service, local browser, or local e2e checks.
- Do not probe remote endpoints unless a later explicit task requires remote-only canary validation.
- Do not create or execute child implementation tasks in this run.
