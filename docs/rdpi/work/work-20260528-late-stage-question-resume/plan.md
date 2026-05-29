# Plan

## Status

Ready for independent plan review.

## Implementation steps

1. Add shared `raise_questions` types and parser helpers in `packages/shared/src/requirementsQuestions.ts`, and export them through `packages/shared/src/index.ts` and `packages/shared/src/browser.ts`.
2. Add or update focused shared/data tests for parser validation and late-stage resume targets in `packages/data/src/__tests__/requirementsQuestions.test.ts`.
3. Add an agent helper module that converts parsed `raise_questions` output into `createTaskRequirementQuestionBatch` calls with the correct stage, target resume stage, source agent, and prompt hash.
4. Wire the helper into `researchDesignStage.ts`, `planner.ts`, `implementer.ts`, `reviewer.ts`, and `qa.ts`. Preserve existing non-product `blocked_external` paths.
5. Update prompts/output contracts so research, design, planning, implementation, review, and QA know to emit `aif-raise-questions` only for product clarification.
6. Update coordinator handoff logic so any lifecycle runner that leaves the task in `needs_input` is not overwritten by the normal success transition.
7. Include `targetResumeStage` in API/WebSocket question payloads and display the resume target in `QuestionsPanel`.
8. Add focused agent/coordinator/API/Web tests for question routing, resume target payload/display, and non-overwrite behavior.
9. Add disabled-intake compatibility coverage proving a downstream `aif-raise-questions` output does not create question batches when `AIF_REQUIREMENTS_INTAKE_ENABLED=false`, and that legacy start routing remains intact.

## Acceptance criteria

- Research, design, planning, implementation, review, and QA can emit one shared `aif-raise-questions` contract.
- Product clarification questions create a blocking question batch and move the task to `needs_input`.
- Answering all blocking questions resumes the task to the stored `targetResumeStage`.
- Runtime, infrastructure, access, permission, malformed output, and external operator failures still use `blocked_external` or existing review/rework handling.
- API/UI clearly show active question batch stage and resume target.
- Existing behavior is preserved when `AIF_REQUIREMENTS_INTAKE_ENABLED=false`.
- Planner, implementer, and reviewer question outputs have explicit tests proving `needs_input`, stored `targetResumeStage`, and no normal success overwrite.

## Proposed checks

- `npm.cmd test --workspace=@aif/shared -- requirementsQuestions`
- `npm.cmd test --workspace=@aif/data -- requirementsQuestions`
- `npm.cmd test --workspace=@aif/agent -- researchDesignStage qaStage coordinatorResearchDesignStages coordinatorQaGate lateStageQuestionResume`
- `npm.cmd test --workspace=@aif/api -- tasks`
- `npm.cmd test --workspace=@aif/web -- TaskDetail`
- `npm.cmd run build`

Focused test cases to add:

- Shared parser accepts `planning`, `implementing`, `review`, and `qa` `targetResumeStage` values and rejects empty question batches.
- Data batch answers resume active batches to `planning`, `implementing`, `review`, and `qa`.
- Planner output with `aif-raise-questions` creates a planning-stage batch, moves to `needs_input`, and is not persisted as a plan.
- Implementer output with `aif-raise-questions` creates an implementing-stage batch, moves to `needs_input`, and is not handed to review.
- Reviewer sidecar output with `aif-raise-questions` creates a review-stage batch, moves to `needs_input`, and is not auto-review accepted as done/QA.
- QA output with `aif-raise-questions` creates a QA-stage batch and does not route to `blocked_external`.
- Disabled-intake mode blocks or ignores downstream question creation without creating question rows, while preserving legacy `backlog -> planning` start behavior.

## Gate request

Independent reviewer should verify that the plan is scoped to the intake card, preserves `blocked_external` semantics for non-product failures, and includes sufficient tests for all target resume stages.
