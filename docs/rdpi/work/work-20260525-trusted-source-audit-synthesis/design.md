# Design: Trusted Source Audit Synthesis

## Goal

Synthesis must classify source batch evidence from trusted source artifact records. Raw report content may still be read for carry-forward and finding extraction, but it must not become a trusted synthesis contributor unless accompanied by an explicit trust contract.

## Contract Changes

Add a shared typed input such as `TrustedSourceAuditArtifact` in `packages/shared/src/auditSynthesisClassifier.ts`.

The record should include:

- artifact identity: `artifactPath`, `taskId`, optional roadmap metadata;
- trusted public source classification: `validated_findings_present` or `validated_no_findings`;
- content and ledger evidence units used only after trust is established;
- explicit trust booleans: manifest valid, ledger valid, source snapshot valid, committed blob verified, completion guard trusted;
- optional source membership status records for required non-trusted artifacts.

Add a blocker record on `AuditSynthesisOutcome`:

- `reasonCodes: string[]`;
- `blockingSourceArtifacts: { artifactPath; taskId?; required; state?; sourceClassification?; reasonCodes }[]`.

This is additive metadata and preserves public outcome names.

## Classifier Behavior

- A source artifact contributes findings or no-findings only when every trust boolean is true and its source classification is trusted.
- `validated_no_findings` is allowed only when every required source artifact is trusted and every trusted source artifact is classified as `validated_no_findings` with substantive no-findings support.
- Required invalid, missing, untrusted, or `source_inconclusive` sources force `source_inconclusive` for no-findings and populate blocker details.
- Optional non-required source records may be excluded from no-findings blockers when explicitly marked non-required/excluded by the typed input.
- Trusted findings may still produce `validated_findings_present`; only trusted source reports may contribute those findings.
- Legacy/raw source report inputs should not remain a trust boundary. Existing call sites and tests should construct typed trusted records instead.

## Data And Implementer Integration

- Keep data-layer trust predicates strict and do not weaken existing lifecycle checks.
- `readAuditSynthesisInputs()` should keep using `listRoadmapReportArtifactsForSynthesis()` but split records into:
  - trusted valid source artifacts with explicit trust proof for the classifier;
  - required non-trusted source artifact blockers with state, failure family, source classification, and reason codes.
- Deterministic synthesis should call the classifier with typed trusted records plus blocker records, then persist the richer synthesis outcome metadata through `formatAuditSynthesisOutcomeForArtifact()`.
- Existing weak-artifact display sections should remain visible for operators and reviewers.

## Test Strategy

Focused shared tests:

- invalid manifest plus strong prose cannot synthesize trusted `validated_no_findings`;
- missing committed source artifact blocks trusted no-findings;
- `source_inconclusive` source report blocks trusted no-findings;
- mixed valid and invalid required reports cannot synthesize green;
- all-valid trusted no-findings reports synthesize `validated_no_findings`.

Data tests:

- trusted report rollups still require full lifecycle and committed validation;
- terminal non-trusted required reports appear as synthesis blockers and reason codes identify the source artifact.

Verification commands:

- `npm.cmd test --workspace=@aif/shared -- auditSynthesisClassifier`
- `npm.cmd test --workspace=@aif/data -- index workflowTimeline`
- `npm.cmd run lint`
- `npm.cmd run build`

## Risks

- Existing dirty prerequisite edits are present in the worktree. Changes must build on current file contents without reverting unrelated edits.
- Type changes in the shared classifier can affect agent/reviewer tests that handcraft synthesis metadata. Prefer additive fields and carefully update direct classifier call sites.
- Completion output parsing must remain backward-compatible for older synthesis metadata while preserving stricter behavior for new trusted source inputs.
