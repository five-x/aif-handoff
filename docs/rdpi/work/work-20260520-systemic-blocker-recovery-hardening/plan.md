# Plan

## Acceptance criteria

- Context overflow no longer immediately becomes manual `blocked_external` when a larger compatible fallback profile is available.
- If no context fallback is available, the task asks for operator input with a concrete runtime/scope action instead of generic manual review.
- Local Qwen runtime profiles are serialized by default across coordinator stages unless profile options explicitly raise concurrency.
- Generated audit report cards with empty tracked scope files can produce deterministic no-findings evidence without fake line references.
- Generated audit report cards with missing/unbounded scope ask for operator input instead of generic manual review.
- Weak/missing/inconclusive audit evidence still does not close green.
- Tests cover coordinator/runtime and implementer/audit paths.

## Implementation steps

1. Add runtime error helpers in the agent layer.
   - Reuse `findRuntimeExecutionError`.
   - Add a small coordinator helper for `context_length` recovery.
   - Add strict fallback profile selection for implementer/audit/synthesis overflow using project/app plan/review defaults first, then visible enabled profiles only when compatible.
   - Define capacity parsing from runtime profile options: `contextWindow`, `nCtx`, `n_ctx`, `maxContextTokens`, `promptTokenBudget`.
   - Exclude the failed profile and any profile already recorded as failed for context overflow on the task.

2. Add durable one-shot context fallback.
   - Store the fallback profile as a task runtime override or task runtime option that survives `blocked_external` retry release.
   - Record the prior/current failed context profile id in task runtime options.
   - Ensure the coordinator does not clear this fallback before the next runtime call consumes it.
   - Revalidate persisted fallback profiles before use against enabled project-visible profiles and context-capacity compatibility; clear stale disabled, other-project, or smaller fallback records.
   - Clear one-shot fallback after successful stage completion or after a different non-context failure.
   - If no compatible fallback exists, persist `operator_input_required:` with `manualReviewRequired=false`, `retryAfter=null`, and a concrete request for a larger profile or smaller task/scope.

3. Add runtime-profile concurrency control.
   - Extend `StageSemaphore` usage to support runtime profile keys.
   - Resolve per-profile concurrency from runtime profile options.
   - Default `qwen-local-agent` profiles to one concurrent stage per profile.
   - Skip candidates when their runtime profile key is at capacity.

4. Harden deterministic audit scope evidence.
   - Allow existing empty files to count as deterministic scope coverage by path evidence.
   - Use `git hash-object -- <path>` fallback when `git grep` has no line output for empty tracked files, so evidence remains content-backed rather than inventory-only.
   - Avoid generating invalid `path:1` references for empty files.
   - Require exact empty-content command proof for empty-file no-findings validation; reject `echo`, inventory-only listing, and unrelated command output.

5. Normalize generated non-repairable audit scope blocks.
   - Add an operator-input terminalization option for generated audit cards where the system cannot infer concrete scope.
   - Keep artifact state `source_inconclusive`.
   - Persist `manualReviewRequired=false` and a `blockedReason` starting with `operator_input_required:`.

6. Add regression tests.
   - Update `packages/agent/src/__tests__/stageErrorHandler.test.ts` only if coordinator behavior requires classifier contract updates.
   - Add/adjust tests in `packages/agent/src/__tests__/coordinator.test.ts`.
   - Include a release-and-rerun context overflow regression proving the durable fallback is actually used.
   - Include stale/crafted durable fallback regressions proving disabled, other-project, and smaller-context profiles are cleared rather than used.
   - Assert context-overflow recovery clears stale `manualReviewRequired`, sets a concrete `blockedReason`, and increments `retryCount`.
   - Add/adjust tests in `packages/agent/src/__tests__/implementer.test.ts`.
   - Assert empty-file deterministic audit output validates, manifest `scopeCoverage.covered` is true, and no fake empty-file line reference is emitted.
   - Assert adversarial empty-file reports without exact empty-content proof do not validate or pass completion.
   - Run targeted agent tests, then build/lint.

## Gate plan

- Independent plan review must return `PLAN PASS` before implementation.
- After implementation, independent tester must return `TEST PASS`.
- After tests pass, independent reviewer must return `REVIEW PASS`.
- If any gate fails, revise and rerun the invalidated gate.
