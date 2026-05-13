# Design

## Chosen design

- Reuse and tighten the shared audit classifier modules:
  - `auditReportValidator.ts` remains the authoritative report artifact validator.
  - `auditSourceEvidence.ts` remains the source prose classifier used by validator and synthesis.
  - `auditRoadmapContract.ts` remains the failure-family mapping layer.
- Add deterministic relevance checks at the shared boundary:
  - Manifest-backed `validated_no_findings` must expose non-empty risk IDs through `riskHypotheses` or scoped `noFindingsClaims`; empty risk IDs should produce a dedicated missing-risk issue.
  - Manifest-backed trusted outcomes must have non-empty scope IDs for claimed coverage; empty scope coverage should produce an existing missing-scope-style validation issue.
  - Ledger evidence scope/risk comparison must stay non-vacuous by running against required manifest scope/risk IDs only after the validator has required those IDs for trusted no-findings.
  - `Scope: .` should be rejected for source report validation with a `missing_scope_coverage` issue explaining that product roots must be declared explicitly.
  - Hidden/generated/report paths should be excluded from product evidence unless the audit mandate directly scopes them.
  - Metadata-only `path:1` evidence should not satisfy no-findings classification or substantive evidence.
- Keep compatibility positives:
  - Valid no-findings reports that cite real scoped product code/config lines, provide observed command output, and include meaningful absence reasoning should remain valid.
  - Existing manifest/ledger positive corpus helpers should stay usable with their non-empty scope/risk metadata.
- Add tests at both direct validator and corpus levels:
  - Missing manifest risk hypotheses.
  - `Scope: .` rejection.
  - Hidden/generated evidence excluded unless explicitly scoped.
  - Metadata/header-only `path:1` no-findings rejected.
  - Existing valid no-findings fixtures still pass.

## Pre-PLAN boundary

- Allowed before `PLAN PASS`:
  - Read intake, RDPI instructions, local docs, local source, and tests.
  - Write planning-only `research.md`, `design.md`, and `plan.md`.
  - Ask an independent reviewer for a `PLAN PASS` or `PLAN FAIL` verdict.
- Not allowed before `PLAN PASS`:
  - Code edits.
  - Test execution.
  - Runtime/service/log/scheduler/worker probing.
  - Shared-memory recall or publication.

## Decision candidates

- Candidate stable project decision: trusted no-findings reports require explicit risk coverage; empty risk metadata is invalid rather than a weaker trusted no-findings pass.
- Candidate reusable pattern: evidence relevance checks should reject vacuous empty expected IDs before comparing actual evidence IDs.
- Candidate reusable pattern: broad repository scopes should fail closed unless the audit runtime can produce deterministic representative product-scope coverage.
