# Research

## Task

work-20260528-qa-gate-and-acceptance-pack

## Status

Research complete on 2026-05-29. Implementation has not started.

## Scope

Implement the queued work intake item for the requirements lifecycle QA gate and done acceptance pack. The task requires a QA status/stage, QA runner behavior, `qa.md` stage artifact handling, `review -> qa -> done` routing when QA is enabled, enforcement that failed mandatory QA checks do not reach done, and an operator-facing done acceptance/readiness pack. `verified` must remain a human-only approval state.

## Sources

- Intake card: `docs/intake/work/work-20260528-qa-gate-and-acceptance-pack.md`
- Prior prerequisite result: `docs/rdpi/work/work-20260528-requirements-snapshot-and-stage-artifacts/result.md`
- Prior prerequisite result: `docs/rdpi/work/work-20260528-research-design-stages/result.md`
- Lifecycle status contracts: `packages/shared/src/types.ts`, `packages/shared/src/constants.ts`, `packages/shared/src/stateMachine.ts`
- Coordinator routing and transition guards: `packages/agent/src/coordinator.ts`
- Research/design stage artifact pattern: `packages/agent/src/subagents/researchDesignStage.ts`
- Data artifact and timeline projection: `packages/data/src/index.ts`
- API task event handling: `packages/api/src/services/taskEvents.ts`
- Task detail and board UI: `packages/web/src/components/task/TaskDetail.tsx`, `packages/web/src/components/task/TaskDetailHeader.tsx`, `packages/web/src/components/kanban/Board.tsx`, `packages/web/src/components/kanban/Column.tsx`
- Independent read-only explorer report from subagent `019e70a4-d9fa-77d1-8b87-32782721e891`.

## Current Behavior

- `TASK_STATUSES` has `review`, `blocked_external`, `done`, and `verified`, but no `qa` state.
- `COORDINATOR_STAGES` has `reviewer` as the final automated stage and no `qa` stage.
- `STATUS_CONFIG`, `ORDERED_STATUSES`, `RUNTIME_STAGES`, and `RUNTIME_STAGE_PROFILE_MODE` do not know about QA.
- `applyHumanTaskEvent` already restricts `approve_done` to `done -> verified`, so verified is human-only today.
- `HUMAN_ACTIONS_BY_STATUS` has no `qa` entry, which will need to be explicit once `TaskStatus` includes QA.
- The coordinator `PIPELINE` currently routes reviewer success to `done`.
- The accepted auto-review branch in `packages/agent/src/coordinator.ts` explicitly updates review tasks to `done`.
- The implementer `skipReview` branch can also bypass directly to `done`.
- Existing completion evidence guards run before terminal handoff, but there is no QA artifact or acceptance-pack requirement.
- `packages/agent/src/subagents/researchDesignStage.ts` provides a strict stage artifact model: fenced JSON output, parser validation, accepted/rejected/blocked artifact attempts, source snapshot binding, prompt hashing, and timeline broadcast.
- The data layer stores task stage artifacts generically by `stage` and `kind`, so `qa` and `acceptance` artifacts can be represented without a schema migration.
- `buildTaskRequirementsContextForPrompt` already recognizes downstream `qa` and `acceptance` prompt contexts, but no QA runner consumes them yet.
- `WORKFLOW_TIMELINE_GENERIC_ARTIFACT_KINDS` does not include `qa` or `acceptance`, so current UI/timeline semantics do not classify those artifacts.
- The web board and task detail UI have no QA column/badge/tab/readiness view.

## Constraints

- Compatibility must be preserved when `AIF_REQUIREMENTS_INTAKE_ENABLED=false`.
- QA must also be disabled unless its own new flag is enabled; the default should preserve current behavior.
- Research/design artifacts should be consumed as context when the research/design flag is enabled and accepted artifacts exist.
- No path may set `verified` directly. Human approval through `approve_done` remains the only path.
- Direct automatic `review -> done` must be blocked/rerouted when QA is required.
- `skipReview` must not create a QA bypass when QA is required.
- A failed mandatory QA check must not allow done.
- Skipped checks must carry reason and risk information in the QA artifact.
- Acceptance pack output must include covered requirements, changed files, review result, QA result, limitations, rollback notes, and readiness for human acceptance.

## Risks

- The worktree is dirty from prerequisite and unrelated work. Edits must be scoped and must not revert existing changes.
- Coordinator terminal handoff has several specialized branches, so QA enforcement should cover both normal success and explicit accepted/skip paths.
- If the QA parser is too loose, mandatory failures can be marked passed. If it is too strict, normal runs may block incorrectly.
- The task response read model is used by list/detail views. Adding acceptance data should avoid requiring new endpoints unless clearly needed.
- UI changes should remain operational and dense, matching the existing task detail surface.

## Research Conclusion

The safest implementation is additive and feature-flagged: introduce `qa` as a lifecycle status/stage, add `AIF_REQUIREMENTS_QA_ENABLED` defaulting off, route `review -> qa -> done` only when both requirements intake and QA are enabled, and record both QA and acceptance as existing task stage artifacts. The acceptance pack should be generated before the coordinator moves a QA-passed task to `done`, and the API should block human `approve_done` if QA is enabled but the accepted QA/acceptance artifacts are missing.
