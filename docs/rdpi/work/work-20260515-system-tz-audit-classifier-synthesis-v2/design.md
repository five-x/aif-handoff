# Design

## Goals

- Establish one shared audit source classifier contract for report validation and synthesis.
- Limit public report outcomes to `validated_findings_present`, `validated_no_findings`, or `source_inconclusive`.
- Keep weak/rejected evidence classifications available as diagnostics and failure-family inputs, not as trusted public outcomes.
- Support strict manifest v2 validation without weakening existing manifest and ledger checks.
- Keep `source_inconclusive` terminal diagnostic output outside trusted synthesis input.
- Preserve deterministic repair containment and avoid model rewrite legalization of weak strict reports.

## Non-goals

- Do not patch live audit-v16 cards.
- Do not implement the full generic workflow timeline persistence migration.
- Do not rename audit/roadmap tables or change schema unless a focused type-only surface requires it.
- Do not loosen source evidence validation or accept inventory-only no-findings.
- Do not implement child follow-up tasks from audit findings.

## Model

Add a strict public source report outcome contract:

- `AuditSourceReportOutcomeKind`
  - `validated_findings_present`
  - `validated_no_findings`
  - `source_inconclusive`

Add a classifier result that keeps diagnostics separate from outcome:

- `outcome`: one of the three public report outcomes.
- `sourceClassification`: existing lower-level evidence classification.
- `trusted`: true only for validated findings/no-findings.
- `failureFamily`: mapped failure family for untrusted reports.
- `reasonCodes`: stable reason/issue codes.
- `artifactPath`: optional path for diagnostics.
- `nextAction`: operator-facing next action.

The existing lower-level classifier remains useful for issue selection:

- `inventory_only_invalid` stays a diagnostic classification and maps to failure family `invalid_inventory_only`.
- `insufficient_substantive_evidence` stays a diagnostic classification and maps to failure family `insufficient_substantive_evidence`.
- Validator issue codes remain the high-signal reason codes for malformed, mismatched, or weak reports.

## Manifest v2

Manifest v2 should require the same core fields as v1 plus the strict public outcome vocabulary:

- identity: `auditPlanId`, `taskId`, `batchId` when expected, `roadmapAlias` when expected, `artifactPath`.
- integrity: `contentSha256`, `sourceSnapshot.id`, `sourceSnapshot.commit/tree` when available, and source snapshot consistency.
- context: task/audit plan/batch identity through the existing expected plan id and optional batch/alias checks.
- coverage: `scopeCoverage`, `riskHypotheses`, and evidence refs.
- findings/no-findings shape: findings required for `validated_findings_present`; no-findings claims and risk/scope coverage required for `validated_no_findings`.
- evidence ownership: existing ledger refs must match task id, audit plan id, source snapshot id, scope ids, and risk ids; discovery-grade evidence cannot back trusted no-findings.

Compatibility rule: support v1 inputs while accepting v2 so existing artifacts/tests can be migrated incrementally. For v1, do not allow weak manifest outcomes to be trusted; normalize invalid/weak source classifications to `source_inconclusive` in new public APIs.

## Synthesis

Synthesis must use the shared public report classifier:

- For each source report, call the shared report classifier.
- Trusted synthesis input includes only reports with public outcomes `validated_findings_present` or `validated_no_findings` and validator `ok`.
- `source_inconclusive` reports are terminal diagnostics and can be listed as weak/invalid source reports, but never counted as trusted synthesis input.
- Final synthesis metadata should use the same public outcome vocabulary. `source_inconclusive` replaces `inconclusive_batch_evidence` as the public outcome while preserving `inconclusive_batch_evidence` as a failure family/reason code where useful for compatibility.

## Deterministic repair

- Keep deterministic report repair as the only repair path for strict audit reports once manifest/evidence validation is active.
- If deterministic repair cannot satisfy strict validation, persist `source_inconclusive` with validation details and terminal handling.
- Do not route strict manifest-backed weak reports to free-form implementer rewrite.

## Artifact trust exposure

Use current roadmap artifact state and trust rollup surfaces:

- `invalid` maps to rejected/untrusted with failure family and reason codes.
- `missing` maps to missing/untrusted with next action `retry_source_rework`.
- `source_inconclusive` and `terminal_inconclusive` map to inconclusive/untrusted with next action `inspect_untrusted_source`.
- `external_blocked` maps to blocked/untrusted or weak with next action `provide_operator_input`.
- `manual_exception` maps to manual exception/weak with next action `provide_operator_input` or current manual exception semantics.

Avoid broad UI/API schema churn in this task unless needed for tests. The existing rollup fields already expose artifact state, trust level, failure family, reason codes, artifact path, next action, and synthesis-input trust.

## Verification design

- Focused unit tests for the shared report outcome classifier and synthesis classifier.
- Validator tests for manifest v2 strict outcomes and weak manifest outcome rejection/normalization.
- Corpus tests for inventory-only and weak no-findings staying untrusted.
- Implementer/data tests for `source_inconclusive` not trusted for synthesis and deterministic repair terminalization.
- Run package-level focused tests first, then broader tests if touched surfaces require it.
