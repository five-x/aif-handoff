# Plan: System TZ Golden Regression Corpus

## Implementation plan

1. Run independent plan review and require explicit `PLAN PASS`.
2. Add or extend a System TZ golden corpus fixture under shared tests with exact failure-family IDs:
   - audit invalid: `inventory_only_no_findings`, `mass_line_one_citations`, `fake_command_output`, `missing_evidence_ref`, `manifest_snapshot_mismatch`, `scope_mismatch`, `risk_mismatch`, `source_inconclusive`
   - development invalid: `feature_out_of_scope_diff`, `fix_without_regression`, `docs_source_change`, `tests_no_run_output`, `review_unclosed_blocker`, `unsafe_shell_command`
3. Reuse the existing audit contract repo helpers rather than creating a second fixture repository.
4. Add shared golden corpus tests that assert:
   - audit invalid cases fail with expected source classification, issue codes, and failure families;
   - valid audit cases remain valid;
   - mutation cases for evidence refs, source snapshots, scope ids, risk ids, command output, acceptance criteria, changed files, test output, and review closure fail as expected;
   - plan manifest, task intent, completion guard, audit classifier/report validator, and permission policy targets are represented by direct validator calls.
5. Harden `validateImplementationManifest` if needed so a passed verification item without output hash/preview fails.
6. Add deterministic data/runtime corpus coverage unconditionally:
   - workflow timeline rollup coverage for plan, implementation, review, evidence, and trust artifact rows;
   - memory redaction coverage proving blocked/redacted source claims cannot be approved or retrieved as trusted memory;
   - runtime resolution coverage proving task/project/app/environment precedence and fallback behavior stay deterministic.
7. Add stale/no-delta rework coverage distinct from unclosed blocker coverage. The test must mutate or remove concrete delta/regression proof and assert the guard fails.
8. Run focused verification.
9. Run independent tester gate and require `TEST PASS`.
10. Run independent final review gate and require `REVIEW PASS`.
11. Write `result.md`, run `$memsync MODE=auto LANE=work TASK_ID=work-20260515-system-tz-golden-regression-corpus`, and update only the matching work intake status entry to `done` after local memory review succeeds.

## Acceptance criteria

- The corpus has explicit, named structure for plans, implementations, reviews, audit reports, memory, and timeline artifacts.
- All audit invalid cases from the intake card are present by exact ID and fail deterministically.
- All development invalid cases from the intake card are present by exact ID and fail deterministically.
- Mutation tests remove or alter evidence refs, source snapshots, substantive command output, test output, changed files outside scope, acceptance criteria, and blocker closure proof, and validators fail with expected codes.
- Unit/integration coverage touches task intent inference, state machine, plan manifest validation, completion guard, audit classifier, audit report validator, workflow timeline rollup, memory redaction, runtime resolution, and permission policy through existing or added deterministic tests.
- No audit-v9 style weak report, source-changing docs task, rework without delta/regression proof, or unclosed blocker can pass the added corpus.

## Verification plan

- `npm.cmd test --workspace=@aif/shared -- --run src/__tests__/systemTzGoldenRegressionCorpus.test.ts src/__tests__/auditContractCorpus.test.ts src/__tests__/taskCompletionEvidence.test.ts src/__tests__/permissionPolicy.test.ts src/__tests__/planQuality.test.ts src/__tests__/taskIntent.test.ts src/__tests__/stateMachine.test.ts`
- `npm.cmd test --workspace=@aif/data -- --run src/__tests__/systemTzGoldenRegressionCorpus.test.ts src/__tests__/workflowTimeline.test.ts src/__tests__/runtimeProfileResolution.test.ts src/__tests__/index.test.ts`
- `npm.cmd test --workspace=@aif/runtime -- --run src/__tests__/resolution.test.ts`
- `npm.cmd run build --workspace=@aif/shared`
- `npm.cmd run lint --workspace=@aif/shared`
- `git diff --check -- packages/shared docs/rdpi/work/work-20260515-system-tz-golden-regression-corpus`

## Reusable patterns

- Golden corpus cases should be named after failure families, not test implementation details.
- Mutation tests should start from a known valid fixture and mutate exactly one trust boundary at a time.
- Corpus fixtures should remain redacted, deterministic, and independent of live services.
