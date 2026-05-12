# Design: Align Source Audit Report Classification

## Goal

Make source report validation and audit synthesis use the same definition of inventory-only versus substantive audit evidence. Inventory-only `No validated findings` source reports must become invalid source artifacts with precise classification details, and final synthesis must remain a fallback detector rather than the first detector.

## Source evidence classifier

Add a shared evidence helper in `packages/shared/src/` and export it from `packages/shared/src/index.ts`.

The helper will own:

- inventory/existence command patterns, including `git ls-files`, `git status`, `git log`, `ls`, `dir`, `find`, `test -e`, `Get-ChildItem`, and common file-existence checks;
- extraction of command-output evidence blocks from markdown report text;
- filtering of inventory/existence commands out of substantive command evidence;
- a source-report content classification with the compatibility vocabulary:
  - `validated_findings_present`
  - `validated_no_findings`
  - `inventory_only_invalid`
  - `insufficient_substantive_evidence`

The classifier will remain markdown-compatible for this containment task. It will not introduce evidence-ledger or manifest requirements.

## Source report validation

Update `packages/shared/src/auditReportValidator.ts` to call the shared helper for no-findings command evidence.

Behavior:

- valid findings continue to require structured `Evidence`, `Risk`, `Verification`, and `Proposed fix` when requested;
- valid no-findings require checked-file wording, existing line references, and at least one non-inventory command-output evidence block;
- inventory-only no-findings produce `missing_substantive_evidence` and classification details instead of `ok: true`;
- mass `path:1` citations without substantive commands remain insufficient;
- broad file-existence prose remains low-quality or insufficient evidence;
- existing synthesis protections are not weakened.

Extend `AuditReportValidationResult` with a source classification field so downstream persistence can record the exact outcome without parsing issue strings.

## Synthesis classification

Update `packages/shared/src/auditSynthesisClassifier.ts` to reuse the same helper for command evidence and inventory detection. The public synthesis outcomes stay unchanged:

- `validated_findings_present`
- `validated_no_findings`
- `inconclusive_batch_evidence`

`inventory_only_invalid` remains source-level detail and maps to `inconclusive_batch_evidence` at batch synthesis.

## Roadmap artifact persistence and counting

Use existing `validationDetailsJson` to persist source classification details through completion evidence. No schema migration is needed.

Update data-layer summary/counting so `valid_artifact_count` counts trusted report artifacts only when:

- artifact role is `report`;
- artifact state is `valid`;
- validation details include a source classification of `validated_findings_present` or `validated_no_findings`.

Valid synthesis artifacts continue to count as valid. Invalid/missing/external-blocked terminal source artifacts continue to make synthesis ready so the final synthesis can produce a terminal inconclusive result when appropriate.

If legacy rows have `state === "valid"` without classification details, treat them as untrusted for `valid_artifact_count` while preserving terminal-state behavior. This is intentionally fail-closed for the batch summary metric.

## Compatibility

Legacy markdown support remains, but only when it proves substantive evidence by the shared rules. Reports with validated findings are still accepted through structured finding sections, and reports with trusted no-findings still pass when they cite scoped files and non-inventory command output.

## Risks and mitigations

- Risk: filtering all `git` commands would reject substantive `git grep` evidence. Mitigation: only classify explicit inventory/status/listing/existence forms as inventory.
- Risk: data-layer trusted count changes could affect old tests that assume raw `state === "valid"`. Mitigation: add explicit classification details to tests that intend trusted validity.
- Risk: source validation and synthesis could drift again. Mitigation: put the inventory command patterns and command evidence extraction in one shared helper with tests in both validator and synthesis suites.
