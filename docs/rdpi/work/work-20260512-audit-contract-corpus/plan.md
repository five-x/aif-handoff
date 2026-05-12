# Plan: Audit Contract Corpus And Mutation Tests

## Implementation Steps

1. Add shared audit corpus helpers in `packages/shared/src/__tests__/fixtures/auditContractCorpus.ts`.
   - Create a small git-backed fixture repo with source, config, persistence, ops, and architecture files.
   - Add helpers for source snapshots, manifest attachment, and matching ledger evidence units.
   - Define invalid, valid no-findings, valid findings, and manifest mutation case arrays.

2. Add `packages/shared/src/__tests__/auditContractCorpus.test.ts`.
   - Validate the invalid golden corpus and assert expected issue codes, source classifications, and failure families.
   - Validate the no-findings and findings golden corpus.
   - Run fixture mutation tests for missing evidence IDs, risk IDs, snapshot IDs, absence reasoning, verification, and substantive commands.
   - Add synthesis classifier assertions for valid no-findings batches, valid findings batches, and inventory-only/weak batches.

3. Add or extend data-layer state transition coverage.
   - Use roadmap batch contracts to prove weak source reports do not increment trusted valid counts.
   - Prove retryable weak reports cannot make synthesis ready.
   - Preserve the existing distinction that terminal inconclusive/manual exception can release readiness but does not count as trusted valid.

4. Update `stryker.conf.mjs`.
   - Include the shared audit contract suites in the shared package mutation test allowlist.
   - Keep mutation scope package-local and avoid unrelated test list churn.

5. Run verification.
   - `npm.cmd test --workspace=@aif/shared -- --run src/__tests__/auditContractCorpus.test.ts src/__tests__/auditReportValidator.test.ts src/__tests__/auditSynthesisClassifier.test.ts src/__tests__/auditRoadmapContract.test.ts src/__tests__/auditEvidenceLedger.test.ts`
   - `npm.cmd test --workspace=@aif/data -- --run src/__tests__/index.test.ts`
   - `npm.cmd run build --workspace=@aif/shared`
   - `npm.cmd run build --workspace=@aif/data`
   - `npm.cmd run mutation:dry-run -- shared`
   - `git diff --check -- stryker.conf.mjs packages/shared/src/__tests__ packages/data/src/__tests__/index.test.ts docs/rdpi/work/work-20260512-audit-contract-corpus`

## Acceptance Criteria

- Golden invalid fixtures cover inventory-only commands, file-existence-only claims, mass line-one citations, fake command output, command mismatch, wrong snapshot, line/snapshot mismatch, contradictory findings/no-findings, missing verification, missing scope, and risk without evidence.
- Golden valid no-findings fixtures cover security/config, runtime boundary, persistence ownership, ops/config validation, and architecture boundary examples with substantive evidence and absence reasoning.
- Golden valid findings fixtures include real source evidence, risk, proposed fix, and verification evidence.
- State transition tests prove weak source reports do not increment trusted valid counts and cannot make synthesis ready.
- Fixture mutation tests prove removing evidence IDs, risk IDs, snapshot IDs, absence reasoning, verification, or substantive commands fails with precise failure families or issue codes.
- Stryker shared dry-run includes the audit contract tests.
- RDPI result records `PLAN PASS`, `TEST PASS`, `REVIEW PASS`, and memory sync status before the intake card is marked done.

## Scope Boundaries

- Do not change production classifier behavior unless a corpus fixture exposes a direct contract gap.
- Do not create or execute child implementation tasks.
- Do not rewrite existing historical tests broadly; add a reusable corpus and keep existing tests as specific regressions.
- Do not introduce runtime service checks, scheduler/log inspection, or live model-dependent review text into the corpus.
