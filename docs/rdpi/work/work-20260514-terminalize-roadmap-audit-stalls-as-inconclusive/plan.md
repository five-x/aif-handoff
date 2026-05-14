# Plan: Terminalize Roadmap Audit Stalls As Inconclusive

## Implementation Checklist

- [x] Add a coordinator helper that terminalizes roadmap source-report no-progress outcomes as `source_inconclusive` and moves the source task to `done`.
- [x] Use the helper in `blockTaskForStalledAutoReview()` when handoff reason is `stalled_rework_loop`.
- [x] Use the helper in `blockTaskForNoSubstantiveReworkDeltaIfNeeded()` when the report artifact SHA did not change.
- [x] Preserve existing `blocked_external + manualReviewRequired` behavior for non-roadmap tasks and synthesis/manual/external paths.
- [x] Update coordinator tests for roadmap stalled-loop terminalization and non-roadmap stalled-loop preservation.
- [x] Update coordinator no-delta tests to assert roadmap report terminalization as source-inconclusive and synthesis release compatibility.
- [x] Run focused tests:
  - `npm.cmd test --workspace=@aif/agent -- --run src/__tests__/coordinator.test.ts src/__tests__/autoReviewHandler.test.ts`
  - `npm.cmd test --workspace=@aif/data -- --run src/__tests__/index.test.ts`
  - `npm.cmd test --workspace=@aif/shared -- --run src/__tests__/auditRoadmapContract.test.ts`
- [x] Run `npm.cmd run build`, `npm.cmd run lint`, and `git diff --check`.
- [ ] Deploy to `192.168.88.67`, then verify health and retry/release the affected `audit-v14` cards if the server does not auto-release them.

## Acceptance Criteria

- `audit-v14` source cards no longer park in `blocked_external` solely because auto-review saw the same validator blockers three times.
- Roadmap source reports with no productive rework become explicit `source_inconclusive` inputs for synthesis.
- Synthesis can continue after every source report is either valid or source-inconclusive.
- The validator remains strict: source-inconclusive is non-trusted, not accepted valid evidence.
- True external blockers and direct non-roadmap manual-review handoffs remain blocked.

## PLAN Gate Request

Review this plan for correctness before implementation. A pass means the implementation can change coordinator lifecycle behavior and tests exactly within this scope.
