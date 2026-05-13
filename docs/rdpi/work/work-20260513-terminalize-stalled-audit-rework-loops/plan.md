# Plan: Terminalize Stalled Audit Rework Loops

## Implementation steps

1. Extend shared types and parsing.
   - Add optional `firstSeenIteration`, `lastSeenIteration`, and `streak` fields to `AutoReviewFinding` in `packages/shared/src/types.ts`.
   - Add optional `reworkSnapshot` metadata to `AutoReviewState` with `iteration`, `artifactPath`, `artifactContentSha`, and `findingIds`.
   - Update `parseAutoReviewState()` in `packages/data/src/index.ts` to preserve valid optional finding metadata and a valid optional `reworkSnapshot` while accepting legacy records.
   - Add data parsing tests for persisted finding metadata, persisted snapshot metadata, and legacy state.

2. Add the configured stall threshold.
   - Add `AGENT_AUTO_REVIEW_STALL_THRESHOLD` to `packages/shared/src/env.ts` with integer minimum `1` and default `3`.
   - Add shared env tests for the default and custom value.
   - Document the setting in `docs/configuration.md`.

3. Enrich review blockers with streak metadata.
   - Add a helper in `packages/agent/src/reviewGate.ts` that enriches current blocking findings from previous persisted findings and current iteration.
   - Use the helper in structured, fallback, legacy blocking-section, deterministic substantive-evidence handoff, and malformed fallback paths wherever `toAutoReviewState()` receives blocker findings.
   - Update `packages/agent/src/__tests__/reviewGate.test.ts` to cover repeated same blockers and fresh blockers.

4. Terminalize stalled request-changes outcomes.
   - Extend `AutoReviewHandlerHandoffReason` in `packages/agent/src/autoReviewHandler.ts` with `stalled_rework_loop`.
   - Add a helper that detects findings with `streak >= env.AGENT_AUTO_REVIEW_STALL_THRESHOLD`.
   - In `handleAutoReviewGate()`, convert `request_changes` to `manual_review_required` with reason `stalled_rework_loop` before normal rework, and before the broader max-iteration fallback when both apply.
   - Include unresolved blocker diagnostics and the threshold in the agent summary comment and activity message.
   - Add tests for same-blocker terminalization below `maxReviewIterations`, fresh blocker progression, and successful rework clearing state.

5. Record rework boundary snapshots.
   - In `packages/agent/src/autoReviewHandler.ts`, when returning `rework_requested`, attach `reworkSnapshot` to the outgoing `autoReviewState`.
   - Use `findRoadmapBatchArtifactByTaskId()` plus the handler `projectRoot` to identify a roadmap artifact path and compute its current file SHA; fall back to the artifact row `contentSha` if the file is missing but the row has a content hash.
   - Include the blocker finding ids in the snapshot.
   - Add unit tests proving the snapshot is present for roadmap artifacts and absent or inert for non-artifact tasks.

6. Block immediate unchanged artifact re-submission.
   - In `packages/agent/src/coordinator.ts`, after an implementer stage that started with `reworkRequested=true` and before the success transition back to `review`, compare the current artifact SHA with `latestTask.autoReviewState.reworkSnapshot.artifactContentSha`.
   - If the SHA is unchanged, move the task to `blocked_external` with `manualReviewRequired=true`, `reworkRequested=false`, preserved `reviewIterationCount`, preserved `autoReviewState`, and a `blockedReason` beginning `manual_review_required: no_substantive_rework_delta`.
   - Include artifact path, baseline/current SHA state, and unresolved blocker ids/text in diagnostics.
   - Allow changed artifact content to proceed to review.
   - Add coordinator tests for unchanged artifact blocking and changed artifact progression.

7. Produce a blocked state for stalled loops.
   - In `packages/agent/src/coordinator.ts`, special-case `manual_review_required` outcomes with `handoffReason === "stalled_rework_loop"`.
   - Move the task to `blocked_external` with `manualReviewRequired=true`, `reworkRequested=false`, preserved `autoReviewState`, current `reviewIterationCount`, and a `blockedReason` that lists unresolved blocker ids/text.
   - Add/update coordinator tests for the blocked status and diagnostics.

8. Run verification.
   - `npm.cmd test -- --run packages/shared/src/__tests__/env.test.ts packages/data/src/__tests__/index.test.ts packages/agent/src/__tests__/reviewGate.test.ts packages/agent/src/__tests__/autoReviewHandler.test.ts packages/agent/src/__tests__/coordinator.test.ts`
   - `npm.cmd test`
   - `npm.cmd run lint`
   - `npm.cmd run build`

9. Close out.
   - Record `PLAN PASS`, `TEST PASS`, `REVIEW PASS`, verification commands, and implementation summary in `result.md`.
   - Run memory sync with `MODE=auto LANE=work TASK_ID=work-20260513-terminalize-stalled-audit-rework-loops`.
   - Update only this task entry in `docs/intake/work_status.json` to `done`, set `rdpiPath`, and set `updated` to `2026-05-13` after local memory review succeeds.

## Acceptance criteria mapping

- Repeated audit review failures grouped by stable fingerprints: finding ids plus persisted streak metadata.
- Terminalization when same blocker survives budget: `AGENT_AUTO_REVIEW_STALL_THRESHOLD`.
- Blocked state records failing facts: coordinator `blockedReason`, summary comment, and preserved enriched `autoReviewState`.
- No immediate blind review ping-pong: unchanged audit artifact rework is blocked before review, and same unresolved blockers terminalize once threshold is reached; audit completion evidence guard remains in force for report artifacts.
- Existing flows preserved: fresh blockers start separate streaks, success clears state, max review iterations remains a separate cap, and existing artifact failure signatures are unchanged.

## Gate requirements

- Independent `PLAN PASS` before implementation.
- Independent `TEST PASS` after verification.
- Independent `REVIEW PASS` after test pass.
- If any gate fails, revise the invalidated artifacts or implementation and rerun that gate.
