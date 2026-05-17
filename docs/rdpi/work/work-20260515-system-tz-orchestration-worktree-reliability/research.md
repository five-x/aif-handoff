# Research

## Task Framing And Lane

- Task ID: `work-20260515-system-tz-orchestration-worktree-reliability`
- Lane: `work`
- Intake: `docs/intake/work/work-20260515-system-tz-orchestration-worktree-reliability.md`
- RDPI needed: yes
- Scope: harden coordinator orchestration, candidate selection, stage execution, runtime gate integration, completion/review gate boundaries, scheduler and auto-queue claims, task locks, pause/resume semantics, branch/worktree drift handling, and explicit task worktree cleanup.
- Out of scope: executing any generated follow-up task, weakening audit/review/completion gates, automatic worktree deletion, or changing chat/MCP/operator trust surfaces beyond what is needed for worktree lifecycle.

## Accepted Planning Sources Or Local Facts

- `AGENTS.md` requires Node commands through `npm.cmd`, local facts before memory, RDPI gates, and independent plan/test/review gates.
- `$runtask` preflight ran `codex-ensure-rdpi.py`; status was `refreshed`.
- `codex-flow-audit.py --repo .` reported `STATUS: clean`.
- The worktree is already heavily dirty with prior System TZ edits and untracked RDPI/memory/intake artifacts. This task must preserve unrelated edits and avoid broad formatting.
- The contract inventory freeze says orchestration ownership is split across `packages/agent`, `packages/api`, `packages/data`, `packages/shared`, and `packages/web`; branch/worktree fields are current provenance fields and must stay visible in workflow/timeline surfaces.
- `packages/shared/src/schema.ts` currently persists `locked_by`, `locked_until`, `last_heartbeat_at`, `scheduled_at`, `branch_name`, and `worktree_path`, but no separate lock stage or `coordinator_id` field.
- `packages/shared/src/types.ts` exposes task `paused`, `lastHeartbeatAt`, `scheduledAt`, `branchName`, and `worktreePath`, but no lock stage/coordinator fields or worktree cleanup status.
- `packages/data/src/index.ts` has `findCoordinatorTaskCandidates`, `claimTask`, `claimBacklogTaskForAdvance`, `releaseTaskClaim`, `releaseStaleTaskClaims`, `listDueScheduledTasks`, `nextBacklogTaskByPosition`, and active pipeline/legacy branch-bound counters.
- `findCoordinatorTaskCandidates` filters paused tasks and active locks, then orders by position and created time.
- `claimTask` atomically writes `lockedBy` and `lockedUntil`; stale locks can be released by TTL or stale heartbeat. The lock does not currently persist stage separately from task status.
- `claimBacklogTaskForAdvance` atomically advances backlog to planning, clears `scheduledAt`, clears blocker/rework fields, sets heartbeat, and skips paused rows. Scheduler and auto-queue share this CAS.
- `processDueScheduledTasks` fires due backlog tasks once through `claimBacklogTaskForAdvance`, skips paused tasks through the data query, clears `scheduledAt`, and broadcasts scheduler/task moved events.
- `listDueScheduledTasks` currently has no explicit `orderBy`, so due scheduled task processing is not guaranteed to be deterministic across SQLite plans.
- API tests already cover create/update scheduledAt validation: future ISO accepted, past timestamps rejected, offset ISO normalized to UTC, null clears.
- `processAutoQueueAdvance` enforces project pool depth, treats active `blocked_external` as in-flight except terminal audit artifact blocks, skips future scheduled tasks, uses dirty shared-root gating when worktrees are disabled/unsupported, and serializes legacy branch-bound tasks without worktrees.
- `pollAndProcess` releases stale claims, runs watchdog/scheduler/auto-queue, applies global/project concurrency caps, checks runtime budgets/limits before claim, claims tasks, executes stages, and releases claims in `finally`.
- `packages/agent/src/pollScheduler.ts` debounces overlapping interval ticks with `isRunning`.
- `packages/agent/src/wakeChannel.ts` debounces rapid wake events and closes cleanly on shutdown.
- `packages/agent/src/stageAbort.ts` aborts active stages and releases their locks on shutdown, but it only knows currently active task IDs and delegates to `releaseTaskClaim`.
- `packages/agent/src/subagentQuery.ts` starts a heartbeat timer around runtime calls; the timer updates `lastHeartbeatAt` and renews the task claim with the injected coordinator id.
- `packages/agent/src/subagents/planner.ts` can create task worktrees when `AIF_TASK_WORKTREES_ENABLED`, project parallel mode, and project worktree support are all true; it persists `branchName` and `worktreePath` on the task.
- `packages/shared/src/gitIsolation.ts` owns branch/worktree helpers. `ensureTaskWorktree` creates or reuses a branch-bound git worktree and copies project context, but there is no explicit cleanup/archive/delete API found in static reads.
- `packages/api/src/services/taskEvents.ts` restores a persisted branch before branch-bound mutation and performs post-run drift checks before persisting fast-fix plan output.
- `packages/api/src/services/commitGeneration.ts` also uses `task.worktreePath ?? project.rootPath` and treats task branch as source of truth before commit runtime work.
- `packages/agent/src/__tests__/autoQueue.test.ts` covers sequential/parallel auto-queue depth, paused tasks, due scheduled tasks, shared CAS race protection, dirty shared-root pause, and worktree-enabled parallel branch-isolated projects.
- Existing tests cover data lock renewal behavior and stale claim release, but not persisted lock stage/coordinator fields, deterministic scheduled ordering, or owner-scoped shutdown release.

## Same-Project Memory

- `docs/kb/system-tz-contract-inventory-freeze.md` is accepted as the current contract inventory. It freezes branch/worktree fields as orchestration provenance and assigns this task ownership for branch/worktree hardening.
- `docs/memory/decisions/decision-78d8736b87160c73.md`: if task worktrees are disabled or unsupported, strict serialization plus dirty-worktree gating is the safe fallback.
- `docs/memory/decisions/decision-d5d1fffb23614128.md`: branch/worktree visibility is part of artifact production; missing/visibility diagnostics should name the branch/worktree and artifact path.
- `docs/memory/patterns/pattern-09a5942fc2e3545b.md`: dirty worktrees should preserve unrelated pre-task baseline context before attributing source edits to a task.

## Cross-Project Reusable Patterns

- No cross-project memory was used. Local repository facts and same-project curated docs were sufficient.

## Rejected Or Stale Memory Candidates

- Shared-memory MCP recall was not used because this is repo/task-specific work and the pre-PLAN boundary forbids shared-memory recall without an explicit waiver.
- Live service checks, scheduler reads, worker report reads, endpoint checks, downstream runtime/config reads, and log probes were not used before `PLAN PASS`.
- Existing API/WS/UI docs were not treated as authoritative when static code had a current implementation path.

## Hypotheses

- H1: Adding explicit `lockStage` and `coordinatorId` persistence around the existing atomic claim/release functions will satisfy lock provenance without changing the public task pipeline states.
- H2: Owner-scoped lock release on shutdown is safer than broad unlock by task ID because it avoids clearing another coordinator's live claim.
- H3: Extracting thin orchestration service modules around lock, scheduler, auto-queue, and worktree cleanup can improve coordinator reliability while keeping high-risk stage/gate logic in place.
- H4: Explicit worktree cleanup should be API-initiated and audited, blocked before verified task state, and should return disk usage warnings instead of deleting automatically.
- H5: Focused tests around the data lock contract, coordinator scheduler/auto-queue contract, task API worktree cleanup, and schema migrations will catch the main regressions without requiring full end-to-end runtime execution.
