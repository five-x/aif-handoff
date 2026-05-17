# Plan

## Scope

Implement the classifier/synthesis slice for `work-20260515-system-tz-audit-classifier-synthesis-v2` only.

## Steps

1. Add the strict public source-report outcome contract in `packages/shared/src/auditSourceEvidence.ts` or a closely related shared module.
   - Keep the existing lower-level `AuditSourceClassification` values for diagnostic classification.
   - Add helper(s) that map validator/source classifications plus issue codes into public outcome, trusted flag, failure family, reason codes, artifact path, and next action.

2. Update `packages/shared/src/auditReportValidator.ts`.
   - Add support for manifest version 2 while preserving existing strict checks.
   - Restrict accepted manifest v2 outcomes to `validated_findings_present`, `validated_no_findings`, and `source_inconclusive`.
   - Ensure manifest outcome comparison uses the public outcome contract, while diagnostics still keep lower-level source classification.
   - Preserve content hash, source snapshot, identity, scope coverage, risk hypotheses, finding/no-findings, and ledger evidence checks.

3. Update `packages/shared/src/auditSynthesisClassifier.ts`.
   - Replace the separate public inconclusive kind with `source_inconclusive` as the public synthesis/report outcome.
   - Keep `inconclusive_batch_evidence` as a compatibility failure/reason code where existing consumers need it.
   - Classify source reports through the shared report outcome helper.
   - Ensure `source_inconclusive` source reports and weak reports do not increase trusted valid counts.

4. Update synthesis/repair consumers if needed.
   - `packages/agent/src/subagents/implementer.ts`: keep source-inconclusive deterministic synthesis and repair behavior aligned with the new public outcome kind.
   - `packages/shared/src/taskCompletionEvidence.ts`: treat `source_inconclusive` synthesis output as terminal audit inconclusive only when explicitly declared.
   - `packages/data/src/index.ts` / `packages/shared/src/auditRoadmapContract.ts`: adjust mappings only if the new helper requires more explicit failure diagnostics.

5. Update tests and fixtures.
   - Add/adjust shared tests for manifest v2, strict source outcomes, inventory-only rejection, source-inconclusive synthesis, and forged metadata.
   - Update agent/data/API expectations only for changed public outcome names.

6. Run verification.
   - Focused shared tests: audit source evidence, report validator, synthesis classifier, contract corpus, task completion evidence.
   - Focused agent/data tests if touched: implementer, review gate, data index/timeline tests.
   - Run `npm.cmd run lint -- --filter` only if supported by the repo scripts is not assumed; otherwise use package test commands and `npm.cmd test` if feasible.

## Acceptance criteria

- Public audit source report outcomes are limited to `validated_findings_present`, `validated_no_findings`, and `source_inconclusive`.
- Validator and synthesis use the same shared public classification source of truth.
- Manifest v2 checks identity, content hash, source snapshot, task/audit plan/batch context, evidence refs/ownership, scope coverage, risk hypothesis coverage, finding/no-findings fields, and substantive no-findings evidence.
- Inventory-only, path-only, directory-listing, and self-reported command-output reports remain rejected and untrusted.
- `source_inconclusive` is terminal diagnostic output and never trusted synthesis input.
- Deterministic repair cannot legalize weak reports or route strict manifest reports to free-form rewrite.
- Every audit failure exposed by touched paths has failure family, reason codes, artifact path, and next action.

## Planned gates

- Independent plan review must return `PLAN PASS` before implementation.
- Independent tester must return `TEST PASS` after implementation.
- Independent final reviewer must return `REVIEW PASS` before close-out.

## Risks and mitigations

- Risk: manifest v2 is breaking. Mitigation: accept v2 while preserving v1 compatibility, then update tests in the touched behavior slice.
- Risk: dirty worktree includes related files. Mitigation: inspect diffs before edits and avoid reverting unrelated changes.
- Risk: broad UI/API schema churn. Mitigation: use existing trust rollup fields unless a test proves a missing explicit classification.
