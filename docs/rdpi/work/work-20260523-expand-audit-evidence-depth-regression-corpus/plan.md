# Plan

## PLAN

1. Extend the corpus fixture type with optional evidence-depth expectations.
2. Add representative invalid fixtures for the missing weak-evidence shapes and annotate existing invalid fixtures with required depth reason codes.
3. Add representative positive no-findings fixtures for empty-file proof and targeted runtime/test output, and annotate existing valid no-findings fixtures with substantive depth expectations.
4. Update `auditContractCorpus.test.ts` to assert fixture depth status, trusted no-findings support, and expected reason codes.
5. Run targeted shared regression tests:
   - `npm.cmd test --workspace=@aif/shared -- auditReportValidator auditSynthesisClassifier auditContractCorpus`
6. Run requested cross-package regression commands:
   - `npm.cmd test --workspace=@aif/agent -- implementer reviewer`
   - `npm.cmd test --workspace=@aif/data -- index`
7. Run `npm.cmd run lint` and `npm.cmd run build`.
8. If tests reveal a narrow contract mismatch, make the smallest fixture-backed production or test correction and rerun affected commands.
9. Write `result.md`, create local memory-review artifacts, and update only the matching entry in `docs/intake/work_status.json` after independent TEST and REVIEW gates pass.

## Evidence Plan

- Test output from shared, agent, data, lint, and build commands.
- Final diff review for changed corpus/test/RDPI/intake files.

## PLAN PASS Criteria

- Plan stays inside the selected intake card.
- Implementation is limited to corpus/tests unless a small contract fix is required.
- Verification covers the requested shared, agent, data, lint, and build commands.
