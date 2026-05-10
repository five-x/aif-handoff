# Design

## Chosen design

Build one explicit audit roadmap flow contract and use it from the existing flow instead of adding another local parser exception.

The contract has three parts:

1. Shared machine contract in `@aif/shared`
   - Add a shared audit roadmap contract module that defines report roles, required generated-task markers, expected artifact parsing, synthesis detection, canonical validation issues, and failure taxonomy.
   - Reuse this module from `taskIntent.ts`, `roadmapGeneration.ts`, `taskCompletionEvidence.ts`, `reviewGate.ts`, `coordinator.ts`, and `taskEvents.ts`.
   - Keep generic roadmap and non-audit task behavior unchanged.

2. Durable audit batch/artifact model
   - Add `roadmap_batches` and `roadmap_batch_artifacts` persistence.
   - `roadmap_batches` tracks project, alias, intent, status, created task ids, synthesis task id, expected artifact count, validation summary, and timestamps.
   - `roadmap_batch_artifacts` tracks batch id, producer task id, report path, role (`report` or `synthesis`), state (`expected`, `valid`, `invalid`, `missing`, `synthesis_not_ready`, `external_blocked`), branch/worktree pointers, validation details, and timestamps.
   - Typed audit imports create the batch/artifact rows atomically with task creation. Existing generic imports do not create these rows.

3. Gate behavior and synthesis readiness
   - Completion validation uses the expected artifact path from the contract/batch when present. It should not accept unrelated report-like files as proof for a typed audit task that names a different report artifact.
   - Recoverable audit artifact/content failures map to rework (`implementing`, `reworkRequested=true`, actionable reason), not `blocked_external`.
   - External failures remain `blocked_external`: runtime capability/provider limits, branch/worktree isolation, missing access, and operator-required external intervention.
   - Synthesis tasks stay paused with a clear `synthesis_not_ready` reason until all expected non-synthesis artifacts in the batch are valid. When the last report validates, the synthesis task can be unpaused and made eligible for normal execution.
   - Synthesis execution input is assembled from `roadmap_batch_artifacts`: enumerate validated non-synthesis artifacts, resolve each producer's `worktreePath` or project root plus branch metadata, load the report content from the declared path, and fail closed with `synthesis_not_ready` if any validated artifact is unavailable.
   - Synthesis completion validates only the declared synthesis artifact and must not read unvalidated report-like files from the current checkout.

4. Audit batch branch/worktree policy
   - For typed audit batches on git projects with branch creation enabled, prefer task worktrees before parallel auto-queue can run the batch.
   - If task worktrees are disabled or unsupported, the supported safe default is strict serialization plus dirty-worktree gating. This fallback must be asserted in tests and surfaced in batch policy metadata.
   - The batch model records the selected execution policy (`worktree_isolated` or `serialized_shared_checkout`) so later synthesis/readiness decisions understand whether artifacts may live outside the shared checkout.

5. Batch-level API/UI surface
   - Existing task `blockedReason` and rework fields remain the task-level surface.
   - Add or extend project/roadmap responses with a batch summary that reports artifact counts by state, synthesis readiness, and the highest-priority failure family.
   - API responses and WebSocket payloads should expose enough structured state to distinguish invalid artifact content, rework needed, external blocker, and synthesis not ready. UI changes can stay minimal if the existing roadmap/task surfaces can display the structured messages.

## Pre-PLAN boundary

- Allowed before `PLAN PASS`: read task card, local code, local docs, existing RDPI artifacts, and write planning-only RDPI artifacts.
- Not allowed before `PLAN PASS`: live server checks, scheduler/log inspection, worker-report inspection, downstream runtime/config mutation, shared-memory recall, or implementation edits.

## Failure taxonomy

- `invalid_artifact_content`: expected report exists but lacks required evidence/risk/verification, has missing/invalid references, is deterministic fallback text, or is otherwise structurally invalid. Recoverable; return to rework.
- `missing_artifact`: expected report artifact is absent or not committed when the contract requires it. Recoverable; return to rework.
- `missing_tool_evidence`: implementation/review did not demonstrate repository tool activity required for audit validation. Recoverable; return to rework unless a manual review flag is explicitly required.
- `synthesis_not_ready`: synthesis task attempted before all expected input reports are valid. Non-external waiting state; pause or hold the synthesis task with an actionable reason.
- `external_blocker`: runtime capability failure, provider limit, auth/permission problem, branch/worktree isolation failure, git policy failure, or missing operator access. Only this family should use `blocked_external`.
- `manual_review_required`: reviewer/gate cannot safely decide. Do not falsely pass; keep an explicit manual-review reason and do not convert it to artifact validity.

## Migration approach

- Add a forward SQLite migration for new tables. Fresh schema definitions include the same tables.
- Do not backfill historical roadmap aliases in this task.
- New code treats missing batch/artifact rows as legacy mode and falls back to the existing completion evidence behavior.
- Existing typed-intent and generic roadmap tests must remain valid.

## Decision candidates

- Durable audit batch state should be first-class data, not inferred only from task tags and current checkout state.
- Report artifact validation should be contract-driven and shared across import, review, completion, approve, and synthesis readiness gates.
- `blocked_external` should mean external intervention is required, not “the report content is invalid.”
