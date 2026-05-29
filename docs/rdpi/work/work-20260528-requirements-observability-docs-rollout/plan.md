# Plan - Requirements Observability Docs And Rollout

## Gate Status

Pending independent `PLAN PASS`.

Implementation must not start until an independent reviewer accepts this plan.

## Scope

Implement the final requirements lifecycle closure slice:

- structured log/metric envelope for lifecycle writes and decisions;
- architecture/API/configuration/runbook docs;
- focused regression coverage for Phase 2-4 paths and disabled-intake compatibility;
- known limitation notes with follow-up references only.

## Implementation Steps

1. Add a shared requirements observability helper.
   - File: `packages/shared/src/requirementsObservability.ts`
   - Export stable event names, metric names, and `buildRequirementsLifecycleMetric()`.
   - Export from `packages/shared/src/index.ts` and `packages/shared/src/browser.ts` only if browser-safe types are needed.
   - Add tests in `packages/shared/src/__tests__/requirementsObservability.test.ts`.

2. Add data-layer lifecycle logs.
   - File: `packages/data/src/index.ts`
   - Emit structured events after successful snapshot creation, stage artifact attempt persistence, question batch creation/deduplication, question batch answer/resume, split proposal create/reuse/conflict/approve/reject, and acceptance-pack creation.
   - Preserve existing activity-log lines.
   - Do not log raw question text, raw answers, raw roadmap content, markdown bodies, provider output, or secrets.

3. Add coordinator/API decision logs for lifecycle decisions that are not pure data writes.
   - File: `packages/agent/src/coordinator.ts`
   - Log QA gate routed/blocked/accepted decisions with stable event keys and non-secret dimensions.
   - File: `packages/api/src/routes/projects.ts`
   - Log successful split-required broadcasts and approve/reject route outcomes if the data-layer event alone does not capture route-level decisions.
   - Keep broadcasts and status transitions unchanged.

4. Update docs.
   - `docs/architecture.md`: requirements lifecycle stages, persistence model, real-time updates, database tables.
   - `docs/api.md`: requirements REST endpoints, task statuses, WebSocket events, split proposal routes, compatibility behavior.
   - `docs/configuration.md`: requirements flags, defaults, rollout matrix, observability event names.
   - `docs/ops/runbook.md`: canary enablement, verification commands, rollback, known limitations and follow-up references.

5. Add focused regression coverage.
   - Shared: helper event/metric names.
   - Data: lifecycle log helper use or emitted envelope fields for snapshot/artifact/question/split/acceptance paths.
   - Agent: QA gate decision path and disabled-intake compatibility remain unchanged.
   - API/Web: only add tests where docs expose behavior not already covered; prefer existing focused suites over a new flaky live e2e.

6. Write `result.md` only after implementation, independent tester, independent final reviewer, and memory sync.
   - Include `PLAN PASS`, `TEST PASS`, and `REVIEW PASS` outcomes.
   - Include verification commands and memory sync status.

## Verification Plan

Run targeted checks first:

- `npm.cmd test --workspace=@aif/shared -- --run src/__tests__/requirementsObservability.test.ts src/__tests__/env.test.ts src/__tests__/stateMachine.test.ts`
- `npm.cmd test --workspace=@aif/data -- --run src/__tests__/requirementsQuestions.test.ts src/__tests__/index.test.ts`
- `npm.cmd test --workspace=@aif/agent -- --run src/__tests__/coordinatorQaGate.test.ts src/__tests__/coordinatorQaGateIntakeDisabled.test.ts src/__tests__/coordinatorLateStageQuestionResume.test.ts`
- `npm.cmd test --workspace=@aif/api -- --run src/__tests__/tasks.test.ts src/__tests__/projects.test.ts`
- `npm.cmd test --workspace=@aif/web -- --run src/__tests__/QuestionsPanel.test.tsx src/__tests__/TaskDetail.test.tsx src/__tests__/RoadmapDialog.test.tsx`

Then run repo-level checks:

- `npm.cmd run build`
- `npm.cmd run lint`
- `npm.cmd test`
- `git diff --check`

Independent tester should rerun at least the targeted checks plus build/lint. If time permits, tester should run full `npm.cmd test`.

## Acceptance Criteria

- Every required lifecycle event has a stable structured log metric:
  - snapshot creation;
  - stage artifact writes;
  - question raise;
  - question answer/resume decision;
  - QA gate routed/blocked/accepted decisions;
  - split-required create/reuse/conflict/approve/reject decisions;
  - acceptance-pack creation.
- Docs describe the full lifecycle, flags/defaults, API routes, WebSocket events, compatibility behavior, rollout/canary, rollback, and known limitations.
- Tests cover deterministic Phase 2-4 behavior and disabled-intake compatibility without requiring live LLM/provider execution.
- No raw secrets, raw user answers, raw provider output, or raw roadmap content are logged or documented.
- No follow-up child task is executed in this run.

## Known Limitations To Document

- No new metrics backend is added; structured logs are the metrics carrier.
- No live provider e2e is run in normal CI because lifecycle runtime execution depends on external agents/providers.
- Split proposal reload/list UX remains limited to the immediate response or WebSocket event unless a separate follow-up implements a proposal list/read surface.
