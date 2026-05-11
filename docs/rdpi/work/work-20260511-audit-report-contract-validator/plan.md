# Plan - Shared Audit Report Contract Validator

## Owned write set

- `packages/shared/src/auditReportValidator.ts`
- `packages/shared/src/taskCompletionEvidence.ts`
- `packages/shared/src/index.ts`
- `packages/shared/src/__tests__/auditReportValidator.test.ts`
- `packages/shared/src/__tests__/taskCompletionEvidence.test.ts`
- Thin integration test files only if needed:
  - `packages/agent/src/__tests__/reviewGate.test.ts`
  - `packages/agent/src/__tests__/coordinator.test.ts`
  - `packages/api/src/__tests__/tasks.test.ts`

## Steps

1. Add the shared audit report validator module with typed issue codes and a result shape that includes issue details, path classifications, substantive evidence status, and human-readable messages.
2. Migrate report-content checks from `taskCompletionEvidence.ts` into the validator while keeping task completion public issue codes stable.
3. Thread validator details through `TaskCompletionEvidenceResult.evidence`.
4. Export the validator API from `packages/shared/src/index.ts`.
5. Add direct validator fixtures:
   - observed bad report rejected;
   - valid no-findings report accepted;
   - valid finding report accepted;
   - contradiction between findings and `No Validated Findings` rejected.
6. Update completion evidence fixtures to assert the observed bad report is rejected through the existing completion guard and that report-only delta behavior still works.
7. Add thin integration assertions only where useful to prove approve/coordinator/batch artifact state can see typed validator details through existing completion evidence results.

## Verification plan

- `npm.cmd test --workspace=@aif/shared -- src/__tests__/auditReportValidator.test.ts src/__tests__/taskCompletionEvidence.test.ts`
- If agent tests are touched: `npm.cmd test --workspace=@aif/agent -- src/__tests__/reviewGate.test.ts src/__tests__/coordinator.test.ts`
- If API approve tests are touched: `npm.cmd test --workspace=@aif/api -- src/__tests__/tasks.test.ts`
- Final focused build/lint if changes are broad enough:
  - `npm.cmd run build`
  - `npm.cmd run lint`

## Plan gate expectations

- `PLAN PASS` requires confirmation that this plan keeps the first task scoped to the shared validator plus compatibility integration, leaving scope coverage, rework freshness, and full batch integration to their own queued tasks.
- Implementation must not start until the independent plan reviewer returns `PLAN PASS`.
