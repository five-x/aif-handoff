# Result - Surface Audit Trust State And Next Actions

## Outcome

Implemented compact audit artifact trust state across data, API, and web task surfaces.

- Added shared `artifactTrust` DTO fields on `Task`.
- Added `buildTaskArtifactTrustRollup()` in the data layer.
- Attached artifact trust rollups to task list and detail API responses.
- Surfaced trusted vs untrusted audit artifact state on task cards, task table rows, detail headers, and workflow timeline rows.
- Added next-action guidance and reason-code context for synthesis retry, source inspection, source rework, operator input, and final/manual states.
- Added live WebSocket cache invalidation for partial task broadcasts so stale `artifactTrust` values are refetched after task completion or movement events.

## Gates

- `PLAN PASS`: independent reviewer passed the plan before implementation.
- Initial `TEST PASS`: independent tester passed the first implementation verification set.
- Initial `REVIEW FAIL`: independent reviewer found stale `artifactTrust` risk after partial live task broadcasts.
- Fix applied: task WebSocket broadcasts now patch visible task fields and invalidate `["tasks"]` plus `["task", id]`; a targeted stale-`artifactTrust` hook test was added.
- Final `TEST PASS`: independent tester reran the invalidated verification set with `useWebSocket.test.ts` included.
- Final `REVIEW PASS`: independent reviewer passed the fixed implementation.

## Verification

- `npm.cmd test --workspace=@aif/data -- --run src/__tests__/index.test.ts src/__tests__/planBRegression.test.ts src/__tests__/workflowTimeline.test.ts` - pass
- `npm.cmd test --workspace=@aif/api -- --run src/__tests__/tasks.test.ts` - pass
- `npm.cmd test --workspace=@aif/web -- --run src/__tests__/useWebSocket.test.ts src/__tests__/TaskCard.test.tsx src/__tests__/TaskListTable.test.tsx src/__tests__/TaskDetailHeader.test.tsx src/__tests__/WorkflowTimelinePanel.test.tsx` - pass
- `npm.cmd run build --workspace=@aif/shared` - pass
- `npm.cmd run build --workspace=@aif/data` - pass
- `npm.cmd run build --workspace=@aif/api` - pass
- `npm.cmd run build --workspace=@aif/web` - pass
- `npm.cmd run lint` - pass; emitted the existing warning that global Turbo 2.9.6 was used because no local `turbo` install was found
- `git diff --check` - pass

## Notes

The worktree had unrelated pre-existing dirty files outside this task scope. They were left untouched.
