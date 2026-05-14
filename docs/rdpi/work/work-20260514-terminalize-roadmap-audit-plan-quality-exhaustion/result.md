# Result: Terminalize Roadmap Audit Plan Quality Exhaustion

Task ID: `work-20260514-terminalize-roadmap-audit-plan-quality-exhaustion`

## Outcome

Implemented roadmap source-report terminalization for plan-quality retry exhaustion.

When `handlePlanQualityFailure()` exceeds `PLAN_QUALITY_MAX_RETRIES`, generated roadmap source-report cards now complete as `source_inconclusive` instead of staying in `blocked_external`. The plan-quality validator still fails the plan; the source artifact is recorded as a non-trusted terminal input for synthesis.

Non-roadmap plan-quality exhaustion still falls through to the existing `blocked_external` operator path.

## Files Changed

- `packages/agent/src/coordinator.ts`
  - Added `plan_quality_exhausted` as a roadmap source-report terminalization reason.
  - Passed `projectRoot` into plan-quality failure handling.
  - Terminalizes only persisted roadmap `role="report"` artifacts after the retry budget is exhausted.
- `packages/agent/src/__tests__/coordinator.test.ts`
  - Preserved non-roadmap blocked behavior.
  - Added roadmap source-report plan-quality exhaustion terminalization coverage.
- `docs/intake/work/work-20260514-terminalize-roadmap-audit-plan-quality-exhaustion.md`
- `docs/rdpi/work/work-20260514-terminalize-roadmap-audit-plan-quality-exhaustion/`
- `docs/intake/work_index.md`
- `docs/intake/work_status.json`

## Verification

- `npm.cmd test --workspace=@aif/agent -- --run src/__tests__/coordinator.test.ts src/__tests__/autoReviewHandler.test.ts` passed.
- `npm.cmd test --workspace=@aif/shared -- --run src/__tests__/planQuality.test.ts src/__tests__/auditRoadmapContract.test.ts` passed.
- `npm.cmd run build --workspace=@aif/agent` passed.
- `npm.cmd run lint --workspace=@aif/agent` passed.
- `npm.cmd run build` passed.
- `npm.cmd run lint` passed.
- `git diff --check` passed.

## Gates

- PLAN PASS: independent reviewer `Socrates`.
- TEST PASS: independent tester `Ampere`.
- REVIEW PASS: independent reviewer `Tesla`.

## Residual Risk

The live `audit-v14` security card was already blocked before this patch. It must be retried after deployment so the new plan-quality exhaustion path can terminalize it as `source_inconclusive`.
