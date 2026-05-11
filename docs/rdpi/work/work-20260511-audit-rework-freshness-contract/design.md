# Design - Audit Rework Freshness Contract

## Goals

- Prevent stale completion evidence from bypassing manual audit report rework.
- Make a fresh manual rework request invalidate prior roadmap report validation.
- Keep no-change closure possible only after the implementer/reviewer path runs after the rework boundary.
- Keep blocked reasons actionable and preserve normal auto-review convergence.

## Non-goals

- Do not redesign the full roadmap batch state model.
- Do not add a database migration; existing artifact fields are enough for a rework boundary marker.
- Do not change review-gate validator unification; that is a separate queued task.
- Do not require empty commits or source/report file changes when a no-change closure is legitimately reviewed after the boundary.

## State contract

Manual `request_changes` on a roadmap report artifact should:

- keep the task transition from `done` to `implementing`;
- set `reworkRequested=true`;
- set the artifact state to `expected`, not `valid`;
- set `failureFamily="rework_needed"`;
- clear `validatedAt` and stale validation details by replacing them with a rework-boundary object;
- keep branch/worktree/project root metadata.

The rework-boundary validation details should include:

- action: `request_changes`
- requestedAt: current event timestamp
- previousState: prior artifact state
- latestHumanComment id, createdAt, and a bounded message excerpt when available

`expected` is preferred over `invalid` for the active rework state because `invalid` is a terminal source-artifact state for synthesis readiness. Active rework is not terminal.

## Coordinator contract

Remove the pre-implementer stale-evidence shortcut for report artifacts. A task with `reworkRequested=true` must run the implementer after manual rework, even if old report evidence still passes.

No-change closure remains possible through the normal implementer -> reviewer -> completion-evidence path. The important freshness boundary is that the implementer/reviewer stages execute after the manual request, not that the filesystem necessarily changes.

## Test design

- Add an API event regression in `packages/api/src/__tests__/tasks.test.ts`:
  - create a roadmap report artifact;
  - mark it valid;
  - insert a human rework comment;
  - POST `request_changes`;
  - assert the task is implementing/reworkRequested and the artifact is no longer valid with `failureFamily=rework_needed`.
- Add a coordinator regression in `packages/agent/src/__tests__/coordinator.test.ts`:
  - create a valid audit report artifact and a reworkRequested implementing report task;
  - ensure old completion evidence is valid;
  - poll the coordinator;
  - assert `runImplementer` is called and the skip activity message is absent.

## Risk controls

- Avoid changing `blocked_external` classification.
- Avoid changing synthesis rework behavior beyond removing the stale report skip.
- Keep artifact invalidation local to manual `request_changes` and roadmap report artifacts.
