# Design: Terminalize Roadmap Audit Stalls As Inconclusive

## Goal

Generated audit roadmap source-report cards should always leave the active pipeline after roadmap generation: either as trusted valid reports or as explicit non-trusted source outcomes that let synthesis produce the final audit result.

## Non-Goals

- Do not accept invalid or weak reports as valid.
- Do not change manual-review semantics for ordinary non-roadmap tasks.
- Do not change true external blocker handling.
- Do not create child implementation tasks from an audit.

## Proposed Change

Add a coordinator helper for roadmap source-report terminal no-progress outcomes:

- Detect a persisted roadmap artifact for the task.
- Apply only when `artifact.role === "report"`.
- Update the roadmap artifact to `state="source_inconclusive"`, `failureFamily="source_inconclusive"`, `classification="source_inconclusive"`, and `reworkStatus="terminal_inconclusive"`.
- Preserve validation details containing the no-progress reason, auto-review state, blocker fingerprints, artifact path, and artifact content hash when available.
- Move the task to `done` with active blocked fields cleared, `reworkRequested=false`, `manualReviewRequired=false`, and the current review iteration preserved.
- Append an activity log explaining that the source report was terminalized as non-trusted source evidence.

Use this helper in two places:

- `blockTaskForStalledAutoReview()` before falling back to the existing `blocked_external` behavior.
- `blockTaskForNoSubstantiveReworkDeltaIfNeeded()` before falling back to the existing `blocked_external` behavior.

The fallback stays unchanged for non-roadmap tasks and for roadmap synthesis artifacts.

## Expected Behavior

- A source report that repeatedly fails the same review blockers becomes `done` plus `source_inconclusive` artifact, not `blocked_external`.
- A source report that rework resubmits without changing the artifact becomes `done` plus `source_inconclusive` artifact, not `blocked_external`.
- `refreshRoadmapBatchSummary()` releases synthesis once every source report is either trusted valid or terminal source outcome.
- Synthesis remains responsible for producing the final user-facing conclusion: validated findings, validated no-findings, or audit inconclusive.

## Risks

- Risk: operators may miss weak source cards because they are `done`. Mitigation: the artifact state and timeline explicitly show `source_inconclusive`; synthesis summarizes weak or invalid reports.
- Risk: terminalizing too early could skip productive rework. Mitigation: this path only activates after existing no-progress guards fire, not on first recoverable validator failures.
- Risk: direct audit cards may stop asking for manual review. Mitigation: require a persisted roadmap report artifact; non-roadmap tasks use the existing block path.

## Verification

- Update coordinator tests for stalled auto-review loops:
  - roadmap report artifact terminalizes to `done` and `source_inconclusive`;
  - non-roadmap task still blocks with `manual_review_required`.
- Update no-delta coordinator test:
  - roadmap report artifact terminalizes to `done` and `source_inconclusive`;
  - preserved non-roadmap/manual behavior remains covered by existing tests.
- Update data regression if needed to prove source-inconclusive artifacts release synthesis.
- Run targeted agent/data tests plus build and lint.
