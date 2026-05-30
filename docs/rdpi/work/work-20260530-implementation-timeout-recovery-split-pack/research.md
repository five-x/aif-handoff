# Research

## Task Framing And Lane

- Task ID: `work-20260530-implementation-timeout-recovery-split-pack`
- Lane: `work`
- Intake card: `docs/intake/work/work-20260530-implementation-timeout-recovery-split-pack.md`
- RDPI needed: yes
- Scope: when implementation execution exhausts the runtime or stage timeout after partial work, persist a compact sanitized recovery pack and propose split/continuation children. Do not schedule another same-scope implementer run and do not execute proposed children in the same run.

## Accepted Planning Sources Or Local Facts

- `docs/intake/work/work-20260530-implementation-timeout-recovery-split-pack.md` defines the required pack contents: sanitized state, changed files, remaining acceptance work, verification status, proposed next child cards, no raw provider diagnostics, no same-run child execution.
- `docs/rdpi/work/work-20260530-fail-closed-implementation-runtime-exhaustion/result.md` records the predecessor behavior: implementer runtime exhaustion now blocks with `blocked_external`, `retryAfter: null`, a stable `implementation_runtime_exhausted_requires_split` reason, cleared context fallback, and no automatic same-scope retry.
- `packages/agent/src/stageErrorHandler.ts` owns stage error classification. `classifyImplementationRuntimeExhaustion()` currently recognizes implementer `RuntimeExecutionError` timeout and structured exhaustion statuses, but not the coordinator wrapper timeout string from `runStageWithTimeout()`.
- `packages/agent/src/coordinator.ts` applies implementation runtime exhaustion before context-length, audit-timeout, and transient runtime fallback handlers. The current branch updates the task to `blocked_external` and appends an activity line, but it does not record a recovery artifact or proposed child work.
- `packages/agent/src/coordinator.ts` `runStageWithTimeout()` wraps each stage with `withTimeout()` and throws a plain `Error("Stage <stage> timed out after ...")`. For implementer stage this is an implementation timeout, but today it is not part of the implementation runtime exhaustion predicate.
- `packages/agent/src/reworkSnapshot.ts` already reads a safe git worktree snapshot: `baselineHeadSha`, `changedFilesDigest`, and bounded porcelain `changedFilesSummary`. It does not store raw diffs.
- `packages/shared/src/runtimeLimitUtils.ts` exports `redactProviderText()` and provider metadata sanitizers. Persisted recovery text must use client-safe redaction, not log-only redaction.
- `packages/data/src/index.ts` exposes `recordTaskStageArtifactAttempt()`. Task stage artifacts project into generic task workflow timelines, so they are a suitable existing persistence surface for a recovery pack without creating a new table.
- `packages/shared/src/schema.ts` and `packages/data/src/index.ts` expose `task_split_proposals` and `createOrReusePendingTaskSplitProposal()`. These persist proposed children without creating runnable task rows until a later approval step.
- `packages/shared/src/types.ts` currently limits split proposal source kinds to `roadmap_import | roadmap_generation`. A recovery split proposal needs a new source kind such as `implementation_recovery`.
- `docs/architecture.md` says `task_split_proposals` are pending/approved/rejected hierarchy proposals before child tasks are created. Approval creates backlog tasks and does not wake the agent automatically.
- `docs/kb/system-tz-contract-inventory-freeze.md` says current generic stage artifacts and task split proposals are compatibility surfaces, and behavior changes should stay narrowly scoped through `@aif/data`.

## Same-Project Memory

- Local curated memory at `docs/memory/tasks/work/work-20260530-fail-closed-implementation-runtime-exhaustion-delta.md` confirms the implemented fail-closed predecessor facts: implementer runtime exhaustion uses `implementation_runtime_exhausted_requires_split`, preserves retry count, clears fallback state, and parent rollups expose the reason family.
- No shared-memory MCP recall was used before `PLAN PASS`; this task's planning facts were available from local task artifacts and repository files.

## Cross-Project Reusable Patterns

- None accepted. The repository already contains the relevant local persistence, redaction, and stage recovery patterns.

## Rejected Or Stale Memory Candidates

- Treating the predecessor task as complete recovery-pack behavior is stale for this task. It only blocks same-scope retries; it does not record a recovery pack, changed-file summary, verification summary, or proposed split children.
- Treating `task_split_proposals` as roadmap-only is stale for this use case. The current DB table is generic enough to store proposed children, but TypeScript source kind types and operator wording need a recovery-specific source kind to avoid overloading roadmap semantics.
- Treating implementation timeouts as only `RuntimeExecutionError("timeout")` is incomplete. The coordinator stage timeout wrapper can produce a plain `Error`, which must be recognized for implementer stage.

## Planning Hypotheses

- H1: A new agent-side recovery-pack builder can assemble bounded, sanitized state from task fields, the existing git snapshot helper, plan checklist text, optional implementation manifest JSON, and runtime error metadata.
- H2: Persisting the pack through `recordTaskStageArtifactAttempt({ stage: "implementation", kind: "recovery_pack", state: "blocked" })` will make it visible in existing workflow timeline surfaces and avoid schema churn.
- H3: Creating or reusing a pending `task_split_proposals` row with source kind `implementation_recovery` will satisfy the "proposed children only" requirement without executing children.
- H4: The blocked task should point to the recovery artifact and proposal IDs in a sanitized `blockedReason` suffix and activity log line.
- H5: Existing fail-closed no-retry behavior should remain first in the coordinator recovery ordering; the pack creation should run inside that branch before the final `blocked_external` update.

## Proposed Evidence Plan

- Add unit coverage for the recovery-pack builder: timeout with partial git changes, timeout/no changes, checklist/verification summary, and redaction of secret-like provider/task text.
- Extend stage error handler coverage for implementer wrapper stage timeout as fail-closed `implementation_runtime_exhausted_requires_split`.
- Extend coordinator coverage to prove an implementation exhaustion records a recovery-pack stage artifact, creates/reuses a pending split proposal, points the blocked task to both IDs, clears fallback state, and does not call the implementer again on the next poll.
- Run focused tests first, then global `npm.cmd run format:check`, `npm.cmd run lint`, `npm.cmd test`, and `npm.cmd run build`.
