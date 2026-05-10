# Plan

## Implementation plan

1. Add a shared audit roadmap contract module.
   - Define canonical artifact roles, artifact states, validation issue classes, and failure families.
   - Move or wrap duplicated audit path/marker/synthesis validation from `taskIntent.ts` and `roadmapGeneration.ts`.
   - Export helpers for parsing expected report artifact paths from task descriptions, validating generated audit cards, identifying synthesis tasks, and mapping completion issues to `rework_needed`, `synthesis_not_ready`, `manual_review_required`, or `external_blocker`.

2. Extend persistence for audit batches.
   - Add schema and migration entries for `roadmap_batches` and `roadmap_batch_artifacts`.
   - Add data-layer functions to create a batch with expected artifacts, find a task's artifact contract, update artifact validation state, summarize batch readiness, read validated artifact inputs, and unpause/update synthesis tasks when ready.
   - Record batch execution policy (`worktree_isolated` or `serialized_shared_checkout`) and per-artifact producer branch/worktree/root pointers.
   - Keep missing batch rows as legacy-compatible behavior.

3. Harden typed audit import/generation.
   - In `importGeneratedTasks`, for explicit `taskIntent: "audit"`, validate the whole generated batch before creating tasks, create a durable audit batch, create artifact rows for every produced task, and record synthesis task id/expected artifact count.
   - Ensure import remains all-or-nothing for invalid typed audit batches.
   - Preserve existing generic and non-audit typed roadmap behavior.

4. Reuse the shared validator across gates.
   - Update `taskIntent.ts` and `roadmapGeneration.ts` to call the shared audit contract helpers.
   - Update `taskCompletionEvidence.ts` so expected artifact paths are preferred when available or declared in task text; legacy report-like changed-file discovery remains a fallback.
   - Update `reviewGate.ts`, `coordinator.ts`, and `taskEvents.ts` to use the shared taxonomy when deciding rework vs external block.

5. Implement recoverable failure routing.
   - For recoverable artifact failures during coordinator completion checks, return the task to `implementing` with `reworkRequested=true`, persist an actionable reason, and update the artifact row to `invalid` or `missing`.
   - For approve-time recoverable artifact failures, also move back to `implementing` rather than `blocked_external`.
   - Keep branch/worktree/runtime/provider failures as `blocked_external`.
   - Preserve manual-review behavior as explicit manual review, not automatic validity.

6. Implement synthesis readiness.
   - Mark synthesis artifact rows separately from per-area report rows.
   - Before synthesis implementation, check that all expected non-synthesis artifacts in the batch are `valid`.
   - If not ready, hold the synthesis task in a non-external paused state with a clear `synthesis_not_ready` reason.
   - When artifact updates make a batch ready, unpause the synthesis task and clear the readiness reason.
   - Assemble synthesis input only from validated non-synthesis artifact rows: resolve producer `worktreePath` or project root/branch metadata, read the declared artifact path, and reject/hold if any validated artifact content cannot be loaded.
   - Inject the loaded validated artifact list/content into the synthesis task prompt or plan context so synthesis cannot produce a false empty summary from the current checkout alone.

7. Enforce or prove the audit batch git isolation policy.
   - For typed audit batches on git projects with branch creation enabled and task worktrees available, require the batch to run as `worktree_isolated`.
   - When task worktrees are disabled or unsupported, persist `serialized_shared_checkout` and ensure auto-queue stays serial with dirty-worktree gating for the batch.
   - Add tests that prove one branch-bound audit task cannot leave the shared checkout in a state that lets a later task or synthesis run on contaminated state.

8. Surface clearer failure messages.
   - Include stable taxonomy prefixes in task `blockedReason` / rework reasons.
   - Include roadmap generation/import error codes and details that distinguish invalid artifact contract from external runtime/git failures.
   - Add batch summary data in API responses and roadmap WebSocket payloads: counts by artifact state, synthesis readiness, highest-priority failure family, and actionable message.
   - Keep UI changes minimal unless existing components need label mapping for the new reason prefixes; tests must still assert the API/UI-facing strings are distinguishable.

9. Add a platform-level deterministic canary.
   - Add a mocked tool-capable runtime or service-level integration test that is independent of botIntevra-specific files.
   - Cover: valid audit report, invalid report requiring rework, external runtime/git blocker, validated synthesis using only validated artifacts, and no partial/false batch success.

10. Record the final contract in `result.md`.

- Include flow contract, failure taxonomy, migration notes, verification commands, and any post-`PLAN PASS` canary evidence.

## Acceptance criteria

- One shared audit roadmap contract is used for generated audit-card validation, roadmap source validation, completion evidence, review gate decisions, coordinator completion guard, and approve-time checks.
- Typed audit import creates durable batch/artifact state for expected reports and synthesis.
- Valid typed audit reports can pass through review/completion/approve using the expected artifact contract.
- Invalid or missing audit artifacts return to rework with actionable findings and do not use `blocked_external`.
- Runtime, provider, permission, branch, worktree, and git isolation failures still use `blocked_external`.
- Typed audit batches record and enforce either `worktree_isolated` or `serialized_shared_checkout` execution policy.
- Synthesis cannot run or pass until expected non-synthesis artifacts are validated and their declared contents can be loaded from the producer branch/worktree/root.
- Synthesis input assembly reads only validated batch artifacts and rejects/holds when any expected validated artifact is unavailable.
- Existing typed-intent behavior and generic roadmap behavior remain intact.
- Batch-level and task-level API/UI-visible reason text distinguishes invalid artifact content, rework needed, external blocker, and synthesis not ready.
- A platform-level mocked canary covers valid report, invalid rework, external blocker, validated synthesis, and no partial/false batch success.

## Verification plan

- Focused tests:
  - `npm.cmd test --workspace=@aif/shared -- --run src/__tests__/taskIntent.test.ts src/__tests__/taskCompletionEvidence.test.ts src/__tests__/db.test.ts`
  - `npm.cmd test --workspace=@aif/data -- --run src/__tests__/index.test.ts`
  - `npm.cmd test --workspace=@aif/api -- --run src/__tests__/roadmapGeneration.test.ts src/__tests__/tasks.test.ts`
  - `npm.cmd test --workspace=@aif/agent -- --run src/__tests__/reviewGate.test.ts src/__tests__/coordinator.test.ts src/__tests__/autoQueue.test.ts`
- Scenario assertions to add:
  - valid typed audit report updates artifact state to `valid` and permits done/approve.
  - invalid typed audit report updates artifact state to `invalid` and returns task to rework, not `blocked_external`.
  - missing expected report updates artifact state to `missing` and returns task to rework.
  - branch/worktree/runtime blocker updates task/batch as external and uses `blocked_external`.
  - synthesis task remains held as `synthesis_not_ready` until all non-synthesis artifacts are valid and loadable.
  - synthesis prompt/context contains only validated batch artifact inputs, not arbitrary report-like files from the current checkout.
  - invalid generated/imported batch creates no partial tasks or artifact rows.
  - typed audit batch git policy is either worktree-isolated or serialized with dirty-worktree gating.
  - batch summary API/WebSocket payloads expose counts and failure family.
  - generic roadmaps and non-audit typed roadmaps keep current behavior.
- Platform canary test:
  - add or extend a service/coordinator integration test with mocked runtime/tool logs and a temporary generic project fixture, covering valid report, invalid rework, external blocker, validated synthesis, and no false empty summary.
- Full checks after focused tests pass:
  - `npm.cmd run lint`
  - `npm.cmd run build`
  - `npm.cmd test -- --concurrency=1`
  - `git diff --check`
- Required independent gates:
  - independent `PLAN PASS` before implementation
  - independent `TEST PASS` after implementation
  - independent `REVIEW PASS` after tests

## Reusable patterns

- Promote task-family contracts into shared typed validators before wiring them into runtime gates.
- Persist batch-level expectations when tasks in separate branches/worktrees must later be synthesized.
- Treat invalid generated artifacts as rework, and reserve external blocking for conditions the implementer cannot fix in the task artifact.
