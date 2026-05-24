# Design

## Approach

Add depth expectations to the shared audit contract corpus and assert them in `auditContractCorpus.test.ts`.

The implementation should keep production behavior unchanged unless tests reveal a small, contract-aligned bug. The corpus is the contract surface for future mutation and regression runs, so fixture metadata should say both:

- what public classification is expected
- which evidence-depth status/reason codes must be present or absent

## Fixture Model

Extend `AuditCorpusReportCase` with optional evidence-depth expectations:

- `expectedEvidenceDepthStatus?: "substantive" | "shallow" | "inconclusive"`
- `expectedEvidenceDepthReasonCodes?: string[]`
- `expectedTrustedNoFindingsSupported?: boolean`

Use these fields in invalid and valid corpus tests. Invalid fixtures should assert required reason codes with `arrayContaining` rather than exact equality so unrelated diagnostics can coexist. Valid no-findings fixtures should assert `status = "substantive"`, `trustedNoFindingsSupported = true`, and no depth reason codes.

## Corpus Expansion

Add or adjust fixtures to cover the intake list:

- Negative:
  - import-only evidence
  - first-line/declaration-only snippets
  - generic and quoted dot-grep output
  - path inventory and file existence
  - loose grep matches
  - path-only risk term matches
  - reused snippets
  - self-reported command output
  - mixed no-risk scoped claims
- Positive:
  - small-file substantive evidence
  - config boundary evidence
  - empty-file proof
  - targeted runtime/test output
  - narrow risk-specific source excerpts

Where a focused validator test already covers the exact behavior, mirror only representative variants into the corpus to avoid bloating test runtime.

## Test Wiring

- Update `auditContractCorpus.test.ts` so all invalid and valid fixtures assert public classification and evidence-depth contract.
- Keep the synthesis corpus test in place because `classifyAuditSynthesisSourceReports` revalidates source reports through `validateAuditReportArtifact`.
- Leave `stryker.conf.mjs` untouched unless the corpus test is absent from the shared mutation list; current local inspection shows it is already included.

## Risk Controls

- Use existing helper builders rather than duplicating manifest construction.
- Keep expected issue codes broad enough to avoid overfitting to ordering.
- Avoid production changes unless a legitimate positive fixture is over-rejected or a required negative fixture is accepted.
