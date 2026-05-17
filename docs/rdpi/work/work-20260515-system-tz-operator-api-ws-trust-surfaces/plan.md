# Plan

## Acceptance Criteria

- REST/API surfaces expose task timeline, artifact trust, evidence, task memory candidates, project knowledge, task runtime usage, project runtime usage, manual exception, project queue state, and worktree cleanup/inspection.
- WebSocket contract includes and emits bounded events for timeline, evidence, trust, manual handoff, memory candidate, usage, queue, and worktree warnings.
- Internal broadcast security keeps token auth, development loopback fallback, task/project/runtime-profile relation validation, server-built bounded payloads, and no raw secrets.
- Task cards show intent, runtime profile, cost, manual review, blocked reason family, artifact trust, worktree, scheduled, auto/manual mode, and memory candidate where applicable.
- Task detail has navigable Overview, Plan, Implementation, Review, Timeline, Evidence, Artifacts, Memory, Runtime, Git, and Comments views or equivalent.
- Evidence, trust, runtime, queue, memory, and Git/worktree views show the System TZ fields without raw provider diagnostics or unbounded command output.

## Implementation Steps

1. Add shared DTOs and WebSocket event types in `packages/shared/src/types.ts` and export them from `packages/shared/src/browser.ts` and `packages/shared/src/index.ts`.
2. Add data-layer read projections in `packages/data/src/index.ts` for task memory candidates, project knowledge, task runtime usage, project runtime usage, and project queue state.
3. Add API schemas in `packages/api/src/schemas.ts` for manual exception alias, worktree cleanup, and bounded query limits.
4. Add task routes in `packages/api/src/routes/tasks.ts`:
   - `GET /tasks/:id/artifact-trust`
   - `GET /tasks/:id/evidence`
   - `GET /tasks/:id/memory`
   - `GET /tasks/:id/runtime-usage`
   - `POST /tasks/:id/manual-exception`
   - `POST /tasks/:id/worktree/cleanup`
5. Add project routes in `packages/api/src/routes/projects.ts`:
   - `GET /projects/:id/knowledge`
   - `GET /projects/:id/runtime-usage`
   - `GET /projects/:id/queue`
   - extend internal broadcast validation for `project:usage_updated`, `project:queue_updated`, `project:worktree_warning`, and `project:memory_candidate_created`.
6. Extend task internal broadcast validation in `packages/api/src/routes/tasks.ts` for the new task-scoped event types only if the payload is server-built from `findTaskById`; otherwise keep those events emitted only from validated server transitions. Add tests for unauthorized calls, invalid type rejection, and bounded task/manual-handoff payloads.
7. Emit new WebSocket events from existing transition points:
   - timeline/trust on task updates/events;
   - manual handoff on manual-review/blocked transitions;
   - memory candidate on approve-done candidate creation;
   - usage on runtime usage recording;
   - queue on task create/move/delete/auto-queue;
   - worktree warning on worktree inspection/cleanup warnings.
8. Add web API methods and hooks in `packages/web/src/lib/api.ts` and `packages/web/src/hooks/useTasks.ts` for task operator projections plus project knowledge, runtime usage, queue state, and worktree inspection/cleanup.
9. Update `packages/web/src/hooks/useWebSocket.ts` to invalidate the new query keys and dispatch no raw payloads beyond existing custom-event patterns.
10. Update `TaskCard` to add runtime/cost/blocked-family/worktree/auto/manual/memory badges using existing badge styling.
11. Update `TaskDetailHeader` tab vocabulary to the operator views and keep existing actions/trust alerts.
12. Update `TaskDetail` to render Overview, Plan, Implementation, Review, Timeline, Evidence, Artifacts, Memory, Runtime, Git, and Comments views using existing components plus small local read-only panels. Memory/project knowledge should use the existing source-backed memory model, not a new store.
13. Add focused API and web tests:

- route coverage for new task/project endpoints and internal broadcast relation validation;
- project knowledge endpoint/UI coverage proving the project knowledge requirement maps to memory-backed source-backed knowledge;
- WebSocket invalidation coverage for new events;
- task card badge coverage;
- task detail operator tab/view coverage;
- worktree cleanup hook/action coverage where feasible without unsafe filesystem work in web tests.

14. Update docs only where needed for new REST/WS contract.

## Verification Plan

Run focused tests first:

- `npm.cmd run test --workspace=@aif/api -- src/__tests__/tasks.test.ts src/__tests__/projects.test.ts src/__tests__/taskWorktrees.test.ts`
- `npm.cmd run test --workspace=@aif/data -- src/__tests__/index.test.ts src/__tests__/workflowTimeline.test.ts`
- `npm.cmd run test --workspace=@aif/web -- src/__tests__/TaskCard.test.tsx src/__tests__/TaskDetail.test.tsx src/__tests__/TaskDetailHeader.test.tsx src/__tests__/WorkflowTimelinePanel.test.tsx src/__tests__/useWebSocket.test.ts`

Then run package builds and lint for touched packages:

- `npm.cmd run build --workspace=@aif/shared`
- `npm.cmd run build --workspace=@aif/data`
- `npm.cmd run build --workspace=@aif/api`
- `npm.cmd run build --workspace=@aif/web`
- `npm.cmd run lint --workspace=@aif/shared`
- `npm.cmd run lint --workspace=@aif/data`
- `npm.cmd run lint --workspace=@aif/api`
- `npm.cmd run lint --workspace=@aif/web`
- `git diff --check`

## Gates

- Independent `PLAN PASS` is required before implementation.
- Independent `TEST PASS` is required after implementation.
- Independent `REVIEW PASS` is required after tests pass.
- If any gate fails, revise the implementation or plan and rerun the invalidated gate.
