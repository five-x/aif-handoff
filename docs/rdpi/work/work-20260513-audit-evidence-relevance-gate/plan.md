# Plan

## Implementation plan

1. Update shared source-evidence classification in `packages/shared/src/auditSourceEvidence.ts`.
   - Add a conservative helper for metadata/header-only line-one evidence.
   - Prevent metadata-only `path:1` citations from satisfying `validated_no_findings`.
   - Keep one-line source/config evidence valid when the line content is substantive code/config.
2. Update report validation in `packages/shared/src/auditReportValidator.ts`.
   - Add issue codes for missing risk hypotheses and irrelevant evidence.
   - Reject explicit `Scope: .` with a missing-scope-coverage validation issue.
   - Build an excluded-evidence set for hidden/generated/report paths that are not directly scoped by the audit mandate.
   - Use the excluded set for scope coverage, source classification, and substantive evidence checks.
   - Require non-empty manifest risk IDs for `validated_no_findings`, accepting IDs from either `riskHypotheses` or scoped no-findings claims.
   - Require non-empty manifest scope IDs for `validated_no_findings`, using `missing_scope_coverage` rather than accepting vacuous ledger comparisons.
   - Keep existing task/audit-plan/source-snapshot evidence identity checks intact.
3. Update failure-family mapping in `packages/shared/src/auditRoadmapContract.ts`.
   - Map missing risk hypotheses and irrelevant evidence into content/contract failure families as appropriate.
4. Add focused tests.
   - Direct validator tests in `packages/shared/src/__tests__/auditReportValidator.test.ts`.
   - Corpus mutation coverage in `packages/shared/src/__tests__/auditContractCorpus.test.ts` and helper support in `packages/shared/src/__tests__/fixtures/auditContractCorpus.ts` if needed.
   - Export any new helper only if tests or downstream code need it through `packages/shared/src/index.ts`.
5. Run verification after implementation only after `PLAN PASS`.
   - Targeted shared tests first.
   - Broader shared package tests if targeted tests pass.

## Acceptance criteria

- Manifest-backed trusted no-findings reports fail validation when risk hypotheses and claim-level risk IDs are empty.
- Evidence refs still fail when task ID, audit plan ID, source snapshot ID, scope IDs, or risk IDs do not match.
- `Scope: .` produces a validation failure instead of silently skipping scope validation.
- Hidden/generated/report paths do not count as product evidence unless directly scoped by the audit mandate.
- `path:1` metadata/header-only citations do not prove no-findings.
- Positive valid no-findings fixtures remain accepted when they provide scoped product evidence, observed command output, and meaningful absence reasoning.
- Validation issue messages make the failure class clear: missing scope, missing risk hypotheses, irrelevant evidence, or insufficient substantive evidence.

## Verification plan

- Independent plan review must return `PLAN PASS` before implementation.
- After implementation, run:
  - `npm.cmd test --workspace=@aif/shared -- auditReportValidator auditContractCorpus auditSynthesisClassifier auditRoadmapContract`
  - If the targeted command is not accepted by the package runner, run the closest package-level shared test command and record the exact command used.
- Independent tester must return `TEST PASS` or `TEST FAIL` using the resulting code and tests.
- Independent final reviewer must return `REVIEW PASS` or `REVIEW FAIL` after `TEST PASS`.
- If any gate fails, revise the invalidated artifacts/code and rerun that gate.

## Reusable patterns

- Fail closed before comparing actual evidence to empty expected scope/risk sets.
- Treat generated/runtime artifacts as non-product evidence by default, with explicit scope roots as the opt-in.
- Keep validator issue codes specific enough that downstream gates can route rework without parsing prose.
