# Plan

## Gate Checklist

- [x] Run RDPI preflight.
- [x] Establish local docs/history and current code facts.
- [x] Use independent agents for local docs, code mapping, and systemic review.
- [ ] Run independent `PLAN PASS` / `PLAN FAIL` gate.
- [ ] After `PLAN PASS`, complete the full read-only code review.
- [ ] Write `result.md` with findings and queued follow-up tasks.

## Review Steps After PLAN PASS

1. Verify critical lifecycle paths with local code inspection:
   - `packages/shared/src/taskCompletionEvidence.ts`
   - `packages/shared/src/auditCardDecision.ts`
   - `packages/shared/src/implementationManifest.ts`
   - `packages/shared/src/stateMachine.ts`
   - `packages/agent/src/coordinator.ts`
   - `packages/agent/src/subagents/implementer.ts`
   - `packages/agent/src/subagents/reviewer.ts`
   - `packages/agent/src/taskWatchdog.ts`
   - `packages/agent/src/stageErrorHandler.ts`
   - `packages/api/src/services/taskEvents.ts`
   - `packages/data/src/index.ts`
   - UI task/trust surfaces under `packages/web/src`

2. Classify each finding against the lifecycle contract:
   - success incorrectly allowed;
   - rework missing or non-deterministic;
   - operator input missing or unstructured;
   - external block overused;
   - artifact trust and task status diverge;
   - API/coordinator/UI disagree;
   - missing regression tests.

3. Confirm whether the current code still contains the stale `source_inconclusive -> done` behavior and where it is locked by tests.

4. Review existing tests to identify which behaviors are intentionally encoded and which regression tests are missing.

5. Produce `docs/rdpi/work/work-20260519-systemic-task-lifecycle-review/result.md`:
   - verdict;
   - findings ordered by severity;
   - exact file references;
   - expected behavioral correction;
   - proposed regression tests;
   - queued follow-up implementation tasks, not code changes.

## Acceptance Criteria

- The review states the real project goal in terms of task lifecycle, not only audit-card UI.
- Findings cover coordinator/API/data/UI/shared paths rather than one local failure.
- Findings identify whether weak/inconclusive main evidence can still be surfaced as success.
- Findings distinguish weak/discarded findings inside a valid report from weak/inconclusive main audit output.
- Findings identify where the system should ask the operator for concrete input instead of closing or generic-blocking.
- No product-code changes are made in this review/discovery RDPI run.

## Verification

- `PLAN PASS` must come from an independent reviewer before result writing.
- This review relies on local code/docs inspection only unless a later explicit implementation or live-validation task is started.
- If the plan reviewer returns `PLAN FAIL`, update research/design/plan and rerun the gate before continuing.
