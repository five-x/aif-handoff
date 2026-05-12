# Design: Audit Contract Corpus And Mutation Tests

## Approach

Add a reusable audit contract corpus in shared test support, then consume it from focused shared and data tests.

The corpus should describe fixtures as structured cases instead of scattered markdown literals:

- invalid source reports with expected `sourceClassification`, issue codes, and failure families;
- valid no-findings reports with substantive command output and explicit absence reasoning;
- valid findings reports with evidence, risk, proposed fix, and verification;
- manifest plus ledger-backed fixtures that can be mutated by removing IDs or changing snapshot/risk/scope bindings;
- state-transition inputs for roadmap batch valid counts and synthesis readiness.

The implementation should keep production code stable unless a fixture exposes an actual missing guard. It should prefer test-only helpers under `packages/shared/src/__tests__/fixtures/` and focused data tests under `packages/data/src/__tests__/`.

## Fixture Shape

Create a fixture module such as `packages/shared/src/__tests__/fixtures/auditContractCorpus.ts` with:

- `initAuditContractRepo()` to create a small git repo with representative source, config, persistence, ops, and architecture files.
- `auditSnapshot(root)` to derive the manifest source snapshot from git.
- `withAuditManifest(input)` to attach a valid `audit-report-manifest` to fixture bodies.
- `auditEvidenceUnit(input)` to build matching ledger evidence units.
- arrays for invalid, valid no-findings, and valid findings cases.
- mutation helpers that derive invalid reports from valid manifest-backed fixtures.

Keep fixtures deterministic and small. They should not require live services or model-generated text.

## Invalid Golden Coverage

The invalid corpus must include at least:

- inventory-only commands;
- file-existence-only claims;
- mass line-one citations;
- fake or placeholder command output;
- command mismatch or unverified command claims;
- wrong source snapshot;
- line/snapshot mismatch;
- contradictory findings and no-findings;
- missing verification;
- missing declared scope coverage;
- risk without evidence.

Each invalid case should assert both an expected issue family and classifier outcome where applicable. For production failure-family mapping, use `selectAuditArtifactFailureFamily()` so the test protects the state machine vocabulary, not just report-level issue codes.

## Valid Golden Coverage

Valid no-findings fixtures must cover:

- security/config;
- runtime boundary;
- persistence ownership;
- ops/config validation;
- architecture boundary.

Every valid no-findings fixture should include:

- `No validated findings`;
- checked files with real `path:line` citations;
- a substantive command with observed output;
- short absence reasoning tying the command/file evidence to the audited risk or boundary.

Valid findings fixtures should include:

- real source evidence;
- risk;
- proposed fix;
- verification evidence with observed command output.

## Mutation Strategy

Add fixture mutation tests that start from a valid manifest plus ledger-backed no-findings report and fail closed when the mutation removes or corrupts:

- manifest `evidenceRefs`;
- risk hypothesis IDs;
- source snapshot IDs;
- absence reasoning;
- verification text;
- substantive command output.

Expected failures should be precise:

- missing refs: `missing_report_manifest_fields` or `missing_audit_evidence_ref`;
- risk/scope mismatch: `audit_evidence_risk_mismatch` or `audit_evidence_scope_mismatch`;
- snapshot mismatch: `manifest_source_snapshot_mismatch` or `audit_evidence_source_snapshot_mismatch`;
- missing verification/substantive command: `missing_substantive_evidence` and `insufficient_substantive_evidence` where applicable.

This covers the user-requested mutation strategy without relying on model text or broad Stryker runs.

## State Transition Coverage

Add data-layer tests proving weak source reports:

- do not increment trusted valid counts when stored as `valid` without trusted classification;
- do not increment trusted valid counts when `sourceClassification` is `inventory_only_invalid` or `insufficient_substantive_evidence`;
- cannot make a synthesis task ready when a retryable weak artifact is present;
- can terminalize readiness only through existing terminal inconclusive/manual exception states while still not counting as trusted valid.

This belongs in `packages/data/src/__tests__/index.test.ts` or a new focused data test file because the state summary logic lives in `packages/data/src/index.ts`.

## Mutation Runner Wiring

Update `stryker.conf.mjs` so the shared package mutation test list includes audit contract suites:

- `auditContractCorpus.test.ts`;
- `auditReportValidator.test.ts`;
- `auditSynthesisClassifier.test.ts`;
- `auditRoadmapContract.test.ts`;
- `auditEvidenceLedger.test.ts` if the corpus depends on ledger helper behavior.

Do not widen mutation scope beyond the shared package audit test allowlist for this task.

## Verification Design

Run focused deterministic suites:

- `npm.cmd test --workspace=@aif/shared -- --run src/__tests__/auditContractCorpus.test.ts src/__tests__/auditReportValidator.test.ts src/__tests__/auditSynthesisClassifier.test.ts src/__tests__/auditRoadmapContract.test.ts src/__tests__/auditEvidenceLedger.test.ts`
- `npm.cmd test --workspace=@aif/data -- --run src/__tests__/index.test.ts`
- `npm.cmd run build --workspace=@aif/shared`
- `npm.cmd run build --workspace=@aif/data`
- `npm.cmd run mutation:dry-run -- shared`
- scoped `git diff --check`

If runtime or time constraints make mutation dry-run impractical, record the exact blocker and keep the task open until an independent tester can validate the mutation wiring.
