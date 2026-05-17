# Design

## Approach

Use the existing coordinator pipeline as the stable runtime path, then harden it by adding explicit durable lock provenance, owner-scoped release semantics, and a small explicit worktree lifecycle surface. Avoid broad coordinator rewrites while making responsibility boundaries visible through narrow services and tests.

## Responsibility Boundaries

- Candidate selection stays in the data layer through `findCoordinatorTaskCandidates`, with tests asserting paused/locked ordering behavior.
- Stage execution stays in `processOneTask`, with lock stage metadata set before stage run and cleared only by owner release.
- Runtime gate stays before `claimTask` in `pollAndProcess`.
- Completion guard stays in `blockTaskForCompletionEvidenceIfNeeded`.
- Review gate stays in `handleAutoReviewGate` plus `reviewGate` helpers.
- Scheduler and auto-queue should become explicit agent services or exported service functions that wrap the existing data-layer CAS calls.
- Lock service should centralize claim, heartbeat renewal, stale release, active owner release, and shutdown release behavior.
- Watchdog remains `taskWatchdog`, but stale lock release must leave enough fields for diagnostics before release and clear lock metadata consistently.
- Artifact trust remains the data/API/web timeline rollup from previous System TZ work; this task should only preserve branch/worktree metadata and use it for worktree cleanup visibility.

## Data Contract

- Add nullable `tasks.lock_stage` and `tasks.coordinator_id`.
- Expose them on shared/data task types as `lockStage: CoordinatorStage | null` and `coordinatorId: string | null`.
- Keep existing `lockedBy` as the lock owner string for compatibility.
- `claimTask(taskId, coordinatorId, lockDurationMs, stage)` writes `lockedBy`, `lockedUntil`, `coordinatorId`, `lockStage`, `lastHeartbeatAt`, and `updatedAt` atomically when the row is unlocked or stale.
- `renewTaskClaim(taskId, coordinatorId, lockDurationMs)` updates `lockedUntil`, `lastHeartbeatAt`, and `updatedAt` only for the owning coordinator.
- `releaseTaskClaim(taskId, coordinatorId?)` clears `lockedBy`, `lockedUntil`, `coordinatorId`, and `lockStage`; when an owner is supplied it must not clear a different owner.
- `releaseStaleTaskClaims()` clears the same lock fields.
- Add `releaseTaskClaimsForCoordinator(coordinatorId)` for shutdown cleanup.

## Scheduler And Auto-Queue

- Preserve the existing `claimBacklogTaskForAdvance` CAS as the shared atomic claim for scheduler and auto-queue.
- Make due scheduled task selection deterministic: order by `scheduledAt`, then `position`, then `createdAt`, then `id`.
- Preserve auto-queue order by `position` and avoid changing its existing scheduled-task skip behavior.
- Keep skipped paused tasks as skipped, not mutated.
- Keep past timestamp rejection in the API validation path.
- Keep `blocked_external` in-flight semantics, including existing terminal audit artifact exceptions.
- Keep dirty shared-root pause when worktrees are disabled/unsupported.
- Keep parallel pools branch-isolated only when task worktrees are enabled and supported.

## Worktree Lifecycle

- Add a worktree inspection and lifecycle service that uses persisted `task.worktreePath`, `task.branchName`, task id, and project root.
- Supported lifecycle actions in this task are explicit `archive` and explicit `delete`; `cleanup` is the umbrella operator workflow, not a third implicit action.
- Inspection should report path, branch, existence, size bytes, cleanup eligibility, and warnings for missing path, missing directory, branch mismatch, non-git path, non-verified task, shared-root aliasing, unexpected path, missing `git worktree list` entry, archive collision, and large disk usage.
- Cleanup actions are explicit API calls only. No coordinator path auto-deletes or archives worktrees.
- Both archive and delete are allowed only for `verified` tasks with persisted `worktreePath` and `branchName`.
- Both archive and delete must first pass hard path-safety checks:
  - resolve and realpath the project root and target path where they exist;
  - reject when the target equals the project root, is inside the project root, contains the project root, or aliases either relationship through symlinks/junctions;
  - reject when the persisted target is not the expected task worktree path generated from `buildTaskWorktreePath(projectRoot, branchName, taskId)`, unless it is an already-recorded archive path under the expected archive root for a later delete;
  - reject when the target is not a git worktree, its current branch does not match `task.branchName`, or `git -C <projectRoot> worktree list --porcelain` does not contain the target path and branch;
  - reject when the target path is missing for archive/delete, while inspection may return a warning only;
  - reject archive when the destination already exists or would fail the same shared-root path checks.
- Archive should use git's worktree-aware move operation to relocate the task worktree to a deterministic archive path outside the project root, persist the new archived path, and append an audit log entry. It must not delete the worktree contents.
- Delete should use git's worktree-aware remove operation for a verified task worktree or archived task worktree that still matches task provenance. It should append an audit log entry before/after the operation and leave durable evidence in the task log; it must not run recursive filesystem deletion directly.
- Every cleanup attempt appends task activity log entries recording action, result, path, branch, size/warnings, and error summary.
- Task detail should keep `worktreePath` visible. Operator cleanup controls can be minimal if the API contract and task log provide an explicit audited path.

## Risks And Mitigations

- Risk: schema migration drift. Mitigate with `db.test.ts` coverage for fresh DB and old-version migration.
- Risk: broad coordinator refactor destabilizes existing gates. Mitigate by thin service wrappers and focused tests rather than moving completion/review logic in this slice.
- Risk: accidental worktree deletion. Mitigate by requiring explicit API action, verified status, persisted path, branch match, and tests for blocked non-verified cleanup.
- Risk: corrupted `worktreePath` points at the shared root or an unsafe path. Mitigate by expected-path, realpath, containment, git-worktree-list, and branch checks before archive/delete.
- Risk: active lock release races. Mitigate by owner-scoped release and tests proving a different coordinator cannot release/renew a claim.
- Risk: dirty worktree contamination. Mitigate by preserving existing shared-root gate and tests.

## Acceptance Mapping

- Coordinator responsibilities: documented through service wrappers and stable named boundaries.
- Locks: persisted with owner, expiry, heartbeat, stage, and coordinator id.
- Stale/active release: stale release clears metadata; shutdown release is owner scoped.
- Duplicate wakes: existing wake debounce remains covered and not weakened.
- Concurrency limits: existing global/project caps remain and are covered by coordinator/auto-queue tests.
- Scheduler: shared CAS, paused skip, one-shot scheduledAt clear, deterministic ordering preserved.
- Auto-queue: sequential/parallel depth, dirty shared-root pause, branch worktree isolation, and blocked in-flight semantics preserved.
- Branch drift: existing branch restoration/drift checks remain before mutation/persist paths.
- Worktree path: already persisted and visible; archive/delete add explicit audited lifecycle and fail closed on unsafe paths.

## Plan Review Revision

- Revision after `PLAN FAIL`: cleanup safety is now explicit and fail-closed for shared-root aliasing, unexpected persisted paths, missing git worktree registration, branch mismatch, non-git paths, and archive destination collision.
- Archive and delete are now defined as distinct supported actions. Inspection is read-only; cleanup is the operator workflow that invokes one of those explicit actions.
