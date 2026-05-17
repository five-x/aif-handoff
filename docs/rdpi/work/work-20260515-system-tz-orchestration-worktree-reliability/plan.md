# Plan

## Scope

Implement the orchestration reliability slice for `work-20260515-system-tz-orchestration-worktree-reliability` without creating or running child tasks.

## Steps

1. Add durable lock provenance.
   - Extend shared schema, database bootstrap/migrations, task row mapping, and public task types with `lockStage` and `coordinatorId`.
   - Update `claimTask`, `renewTaskClaim`, `releaseTaskClaim`, and `releaseStaleTaskClaims` to persist and clear lock metadata consistently.
   - Add owner-scoped `releaseTaskClaimsForCoordinator`.

2. Wire the coordinator to the lock service contract.
   - Claim with the current stage label.
   - Release with the current `COORDINATOR_ID`.
   - Release all owned active locks during shutdown through `stageAbort` or the agent shutdown handler.
   - Keep existing runtime gate, completion guard, review gate, scheduler, auto-queue, watchdog, and stage execution behavior intact.

3. Isolate orchestration responsibilities with thin services.
   - Introduce or update small agent modules for scheduler, auto-queue, lock/shutdown release, and worktree lifecycle.
   - Keep high-risk stage/gate logic in `coordinator.ts` unless a direct extraction is mechanical and covered by tests.

4. Add explicit worktree lifecycle.
   - Add inspection and explicit cleanup helpers for task worktrees.
   - Implement three API surfaces: read-only inspect, explicit archive, and explicit delete.
   - Treat cleanup as an operator workflow that chooses archive or delete; do not implement any automatic cleanup path.
   - Block archive/delete before `verified`.
   - Require persisted path, persisted branch, expected generated worktree path, branch consistency, and `git worktree list --porcelain` membership.
   - Reject cleanup when `worktreePath` equals the project root, is inside the project root, contains the project root, aliases the project root after realpath resolution, is outside the expected task worktree location, is not a git worktree, has no matching git worktree registry entry, or has a branch mismatch.
   - Reject archive when the deterministic archive destination already exists, is inside the project root, aliases the project root, or fails path normalization checks.
   - Use git worktree operations for lifecycle actions: archive via a worktree-aware move to a deterministic archive path, delete via worktree-aware remove. Do not recursively delete arbitrary filesystem paths.
   - Persist archive path after archive, keep branch/worktree provenance visible, and append audited task activity log entries for successful and blocked archive/delete attempts.
   - Return disk-usage warnings in inspection/cleanup responses.

5. Preserve scheduler and auto-queue semantics.
   - Keep scheduler and auto-queue on `claimBacklogTaskForAdvance`.
   - Add explicit `orderBy(scheduledAt, position, createdAt, id)` to due scheduled task selection.
   - Ensure paused tasks are skipped, due scheduled tasks fire once, future scheduled tasks remain queued for scheduler, and auto-queue respects dirty shared-root and legacy branch-bound serialization.

6. Add focused tests.
   - Shared DB migration/fresh schema tests for `lock_stage` and `coordinator_id`.
   - Data tests for owner-scoped claim/renew/release/stale release and lock stage persistence.
   - Agent tests for claim stage wiring, shutdown lock release, scheduler/auto-queue preserved behavior, and no duplicate wake regression if touched.
   - API/service tests for scheduledAt validation preservation and worktree inspect/archive/delete behavior.
   - Path-safety tests for shared-root equality, path containment in both directions, symlink/junction or realpath aliasing where supported, unexpected path outside the expected task worktree location, non-git path, missing `git worktree list` entry, branch mismatch, missing metadata, and archive destination collision.
   - Web/shared type tests only if UI or DTO surfaces change beyond existing task detail fields.

7. Run verification.
   - `npm.cmd run test --workspace=@aif/shared -- src/__tests__/db.test.ts src/__tests__/schema.test.ts`
   - `npm.cmd run test --workspace=@aif/data -- src/__tests__/index.test.ts`
   - `npm.cmd run test --workspace=@aif/agent -- src/__tests__/coordinator.test.ts src/__tests__/autoQueue.test.ts src/__tests__/wakeChannel.test.ts`
   - `npm.cmd run test --workspace=@aif/api -- src/__tests__/tasks.test.ts src/__tests__/projects.test.ts`
   - Targeted package builds for touched packages.
   - `git diff --check`

## Acceptance Criteria

- Task locks persist `lockedBy`, `lockedUntil`, `lastHeartbeatAt`, `lockStage`, and `coordinatorId`.
- Stale lock release and shutdown release clear all lock metadata without releasing another coordinator's claim.
- Scheduler due-task firing remains one-shot, skips paused tasks, rejects past timestamps through API validation, and shares CAS with auto-queue.
- Auto-queue preserves sequential/parallel pool behavior, dirty shared-root pause, legacy branch-bound serialization, worktree-enabled parallel eligibility, and `blocked_external` in-flight semantics.
- Branch/worktree drift checks still run before branch-bound mutation or persisted output.
- Worktree path remains persisted and visible, and explicit archive/delete is audited and never automatic before verified state.
- Worktree archive/delete rejects unsafe targets including shared-root aliases, unexpected persisted paths, non-worktree directories, missing git worktree registrations, branch mismatches, and archive destination collisions.
- Independent `PLAN PASS`, `TEST PASS`, and `REVIEW PASS` gates are recorded before task close-out.

## Evidence Plan

- Static code diff showing data/schema/API/coordinator/worktree changes.
- Test command outputs from the focused suites above.
- Explicit path-safety test output for worktree lifecycle guardrails.
- `git diff --check` output.
- Result artifact records plan/test/review verdicts and memory sync status.

## Plan Review Revision

- Initial independent plan review returned `PLAN FAIL` because cleanup safety and archive/delete semantics were underspecified.
- This revision defines inspect/archive/delete separately and adds fail-closed path-safety and git-worktree registry checks before any archive/delete action.
