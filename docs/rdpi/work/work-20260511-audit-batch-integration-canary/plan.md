# Plan - Audit Batch Integration Canary

## Steps

1. Add or reuse small test helpers for generic temp git audit fixtures in `coordinator.test.ts`.
2. Add a typed audit batch lifecycle canary that creates report and synthesis tasks plus a roadmap batch contract.
3. Assert synthesis is held while report artifacts are still `expected`.
4. Commit a weak report fixture with:
   - synthetic git output such as `1234567 (HEAD -> main)`;
   - both findings and `No Validated Findings`;
   - evidence limited to docs/governance files while task scope names generic source roots.
5. Process the report through the coordinator/review path and assert the report artifact is invalid/rework-needed and the task is returned to implementation or blocked with an actionable guard reason.
6. Cover manual `request_changes` freshness by invalidating a previously valid report artifact, asserting `reworkBoundary` details, and asserting the next coordinator pass calls the implementer instead of skipping stale rework.
7. Commit or fixture a valid report with scoped source evidence and assert the report artifact becomes `valid`.
8. Assert synthesis readiness semantics explicitly:
   - `expected` source artifacts block synthesis readiness and hold the synthesis task.
   - `invalid`, `missing`, and `external_blocked` source artifacts are terminal for readiness calculations when all source artifacts have reached terminal states.
   - terminal invalid sources may allow synthesis to proceed, but they must not become validated finding inputs.
9. Add or extend focused implementer synthesis-input coverage so only valid report contents appear as synthesis findings and invalid reports appear only as weak/invalid metadata. The assertion must prove invalid report content is excluded from the validated source block while the invalid artifact metadata is still visible to synthesis as a coverage gap.
10. Add runtime registry usage coverage for:
    - partial/local token usage with no paid cost;
    - full/external token plus cost usage.
11. Run the focused verification commands from `design.md`.
12. Send the implemented change set to an independent tester and require an explicit `TEST PASS`. If the tester returns `TEST FAIL`, fix the failure and rerun the invalidated test gate.
13. After `TEST PASS`, send the change set to an independent reviewer and require an explicit `REVIEW PASS`. If the reviewer returns `REVIEW FAIL`, fix the blocker and rerun any invalidated gates.
14. Only after `TEST PASS` and `REVIEW PASS`, record gate results in `result.md`, run `$memsync MODE=auto LANE=work TASK_ID=work-20260511-audit-batch-integration-canary`, and update only this task's entry in `docs/intake/work_status.json` after successful local memory review.

## Plan review criteria

- The plan is test-first and does not depend on live Qwen.
- The canary uses generic fixture paths, not canary-project source paths.
- The test covers cross-component lifecycle behavior, not only validator unit behavior.
- Runtime usage coverage distinguishes token observability from paid cost accounting.
- No production code change is planned unless the canary exposes a concrete gap.

## Planned commands

- `npm.cmd test --workspace=@aif/agent -- src/__tests__/coordinator.test.ts src/__tests__/implementer.test.ts`
- `npm.cmd test --workspace=@aif/runtime -- src/__tests__/registry.test.ts`
- `npm.cmd run build --workspace=@aif/agent`
- `npm.cmd run build --workspace=@aif/runtime`
- `git diff --check`
