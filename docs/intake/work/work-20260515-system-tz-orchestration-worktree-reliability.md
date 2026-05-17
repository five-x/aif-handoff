# System TZ Orchestration Worktree Reliability

- Task ID: work-20260515-system-tz-orchestration-worktree-reliability
- Lane: work
- Status: queued
- Priority: high
- Created: 2026-05-15
- Due: after contract inventory and before broad parallel rollout
- Source: `C:\Users\apron\Desktop\aif_handoff_system_tz.md`, sections 12, 13, 25 P1
- RDPI Needed: yes
- RDPI Path: docs/rdpi/work/work-20260515-system-tz-orchestration-worktree-reliability

## Request

Harden orchestration reliability, branch/worktree lifecycle, auto-queue behavior, scheduler behavior, locks, pause/resume semantics, and explicit worktree cleanup.

The coordinator should be decomposed into explicit services where useful and must prevent duplicate starts, branch drift, dirty shared-root contamination, and unsafe parallel execution.

## Done When

- Coordinator responsibilities are split or clearly isolated around candidate selection, stage execution, runtime gate, completion guard, review gate, scheduler, auto-queue, lock service, watchdog, and artifact trust service.
- Locks persist lockedBy, lockedUntil, lastHeartbeatAt, stage, and coordinatorId.
- Stale locks auto-release, active locks release on shutdown, duplicate wakes debounce, and project/global concurrency limits are respected.
- Scheduler fires scheduledAt once, skips paused tasks, rejects past timestamps, shares atomic claim behavior with auto-queue, and has deterministic ordering.
- Auto-queue enforces sequential depth, parallel depth, branch-isolated worktrees, dirty-tree pause, and blocked_external in-flight semantics.
- Branch drift blocks before persisting output.
- Task worktree path is persisted and visible.
- Worktree cleanup/archive/delete is explicit, audited, never automatic before verified, and warns on disk usage.

## Constraints

- Do not auto-delete worktrees before verified state.
- Do not let parallel tasks mutate the shared root.
- Do not hide pause semantics: pause prevents new picks but does not kill running runtime sessions.

## Notes

- Existing queued task hierarchy work should be treated as related but not a prerequisite unless RDPI proves coupling.
