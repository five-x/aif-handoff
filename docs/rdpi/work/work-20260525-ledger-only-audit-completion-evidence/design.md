# Design: Ledger-Only Audit Completion Evidence

## Objective

Trusted audit completion must have one source of truth: a committed audit artifact whose validator result, manifest, ledger evidence, source snapshot, and committed blob lifecycle are all valid. Legacy markdown/prose evidence remains diagnostic only.

## Trust model

Add an explicit shared trust mode:

```ts
export type AuditTrustMode = "diagnostic" | "trusted_artifact";
```

Default behavior should be conservative for compatibility:

- `diagnostic`: keep existing broad diagnostic reporting. Legacy/text evidence may contribute to diagnostic `substantiveReportEvidence`.
- `trusted_artifact`: only strict trusted artifact evidence can satisfy trusted audit completion. Legacy/text evidence may be surfaced separately but cannot make `ok=true`.

Trusted mode should be selected when a task is evaluating a roadmap audit artifact (`auditArtifactRole` is `report` or `synthesis`, or `roadmapBatchId` is present) or when the caller explicitly sets `auditTrustMode: "trusted_artifact"`.

## Strict trusted artifact predicate

In `packages/shared/src/taskCompletionEvidence.ts`, compute a predicate equivalent to:

```ts
trustedAuditArtifact =
  auditReportValidation.ok &&
  auditReportValidation.manifestStatus === "valid" &&
  auditReportValidation.sourceClassification !== "source_inconclusive" &&
  auditReportValidation.sourceClassification !== "inventory_only_invalid" &&
  requireAuditLedgerEvidence === true &&
  auditArtifactLifecycle?.ok === true &&
  auditArtifactLifecycle.states.artifact_state_valid === true &&
  auditArtifactLifecycle.committedValidation?.ok === true;
```

The lifecycle check already includes committed blob presence, clean artifact path, committed revalidation, and hash equality. The validator check already includes manifest, content hash, ledger identity, scope/risk binding, and source snapshot checks.

For trusted completion, pass an expected source snapshot into both worktree validation and committed lifecycle revalidation. If the latest `HEAD` commit only changes the report artifact, derive the expected source snapshot from `HEAD^`; otherwise derive it from `HEAD`. This rejects reports whose manifest and ledger are internally consistent but bound to an older source snapshot after the audited source has advanced.

## Evidence fields

Preserve current diagnostic visibility while adding explicit trusted visibility:

- Keep `substantiveReportEvidence` as a diagnostic signal if needed for existing consumers.
- Add `legacySubstantiveReportEvidence` to the returned evidence so callers and tests can distinguish text-only/prose evidence.
- Add `trustedAuditArtifact` to the returned evidence so trusted state has a direct machine-readable field.
- Add `auditTrustMode` to the returned evidence.

In trusted mode, completion success for audit artifacts must depend on `trustedAuditArtifact`, not `substantiveReportEvidence`.

## Reason codes

Reuse existing concrete validator/lifecycle issue codes when available:

- `missing_report_manifest`
- `missing_report_manifest_fields`
- `invalid_report_manifest`
- `manifest_content_hash_mismatch`
- `manifest_source_snapshot_mismatch`
- `missing_audit_evidence_ref`
- `audit_evidence_*`
- `audit_artifact_uncommitted`
- `committed_blob_mismatch`

Add a narrow code only if needed to distinguish a legacy-only trusted-mode failure:

```ts
"legacy_text_evidence_untrusted";
```

This code should appear when trusted mode is active, legacy/text substantive evidence is present, and strict trusted artifact proof is absent. It should not replace lower-level manifest, ledger, snapshot, or lifecycle issue codes.

## Validator interaction

Do not rewrite validator semantics broadly. The validator can still support diagnostic mode and existing tests. Trusted mode should require:

- `requireAuditLedgerEvidence: true`
- valid manifest
- ledger refs present and valid
- source classification not inconclusive
- lifecycle validation present and valid

Live snapshot fallback is allowed only as diagnostic context. Trusted artifact proof must come through the manifest/source snapshot and committed lifecycle evidence.

## Data/API interaction

The data layer already rejects trusted counts without full lifecycle evidence. Keep that central predicate intact. If `trustedAuditArtifact` is added to persisted completion evidence, data trust can optionally read it as a reason-code aid, but it must not replace lifecycle validation.

API and coordinator flows should continue persisting `result.evidence`, now including `trustedAuditArtifact`, `legacySubstantiveReportEvidence`, and `auditTrustMode`.

## Test strategy

Shared tests should prove:

- A legacy/text-only report that appears substantive remains diagnostic but fails trusted mode.
- Missing ledger in trusted mode fails closed.
- Placeholder manifest hash fails trusted mode.
- Stale source snapshot fails trusted mode.
- Fully valid committed ledger-backed artifact passes trusted mode.
- Diagnostic mode can still surface legacy evidence without marking trusted artifact valid.

Data/API tests should be touched only if source changes alter persisted reason-code or rollup behavior.
