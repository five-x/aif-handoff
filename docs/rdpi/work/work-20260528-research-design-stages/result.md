<!-- Managed by RDPI for task work-20260528-research-design-stages. -->

# Result - Research And Design Stages

## Outcome

Implemented research and design lifecycle stages for requirements intake behind `AIF_REQUIREMENTS_RESEARCH_DESIGN_ENABLED=false` by default.

The legacy paths remain preserved:

- With `AIF_REQUIREMENTS_INTAKE_ENABLED=false`, tasks route directly to planning without requirements, research, or design gates.
- With requirements intake enabled and research/design disabled, the Phase 1 requirements-to-planning behavior remains unchanged.
- With both flags enabled, the coordinator routes `requirements_analysis -> research -> design -> planning`.

## Implemented changes

- Added shared `research` and `design` task statuses plus `researcher` and `designer` coordinator stages.
- Added the `AIF_REQUIREMENTS_RESEARCH_DESIGN_ENABLED` environment flag with default `false`.
- Added strict research/design stage runners that require exactly one fenced `aif-stage-artifact` JSON block.
- Persisted accepted research/design artifacts through task stage artifact attempts.
- Added structured product clarification handling so research/design questions create stage-local requirement question batches and move tasks to `needs_input`.
- Preserved infrastructure/manual stage blockage as `blocked_external`.
- Added artifact gates for accepted or waived research/design outputs before planning.
- Bound accepted artifacts to the current requirements snapshot, and bound design artifacts to the current research artifact where applicable.
- Updated planner prompt context to include the current requirements snapshot, accepted/waived research/design artifact metadata, bounded artifact body content, and answered stage-local questions newer than the active snapshot.
- Updated API, UI, status schemas, and focused fixtures for the new lifecycle statuses.

## Gate outcomes

- `PLAN PASS`: independent plan review passed before implementation.
- Initial final review: `REVIEW FAIL` for prompt artifact body omission, missing answered stage-local question context, and stale artifact acceptance.
- Fixes were applied for all three review blockers.
- `TEST PASS`: independent tester passed after rerun.
- `REVIEW PASS`: independent reviewer passed after rerun.

## Verification

Passed:

- `npm.cmd test --workspace=@aif/shared -- --run src/__tests__/stateMachine.test.ts src/__tests__/env.test.ts src/__tests__/schema.test.ts`
- `npm.cmd test --workspace=@aif/data -- --run src/__tests__/requirementsQuestions.test.ts src/__tests__/workflowTimeline.test.ts`
- `npm.cmd test --workspace=@aif/agent -- --run src/__tests__/coordinatorRequirementsSnapshotGuard.test.ts src/__tests__/coordinatorResearchDesignStages.test.ts src/__tests__/researchDesignStage.test.ts src/__tests__/planner.test.ts`
- `npm.cmd test --workspace=@aif/web -- --run src/__tests__/WorkflowTimelinePanel.test.tsx src/__tests__/TaskDetail.test.tsx`
- `npm.cmd run build`
- `npm.cmd test`
- `npm.cmd run lint`
- `git diff --check`

Notes:

- `npm.cmd run lint` exited 0 with an existing non-fatal warning in `packages/agent/src/subagents/reviewer.ts`.
- Agent tests emitted expected local notifier fetch failures to `localhost:3009`; tests passed.
- No live LLM end-to-end task flow was run; coverage is through unit/integration tests and independent gates.

## Memory sync

`success`: auto memsync generated local memory artifacts and ingested 8 shared-memory items.
