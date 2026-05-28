<!-- Managed by RDPI for task work-20260528-requirements-intake-mvp. -->

# Plan

## Implementation plan

1. Shared contracts:
   - [ ] Extend `TaskStatus`, `CoordinatorStage`, and `WsEventType` in `packages/shared/src/types.ts`.
   - [ ] Extend `TaskEvent` only with `request_requirements_reanalysis` and `approve_requirements`; do not add a generic `submit_answers` event.
   - [ ] Extend `STATUS_CONFIG` and `ORDERED_STATUSES` in `packages/shared/src/constants.ts`.
   - [ ] Add `packages/shared/src/requirementsQuestions.ts` with question stages, answer types, statuses, shared interfaces, answer validation, and secret-like answer detection.
   - [ ] Export new contracts through `packages/shared/src/index.ts` and `packages/shared/src/browser.ts`.
   - [ ] Add env-schema flags in `packages/shared/src/env.ts`: `AIF_REQUIREMENTS_INTAKE_ENABLED`, `AIF_REQUIREMENTS_INTAKE_FOR_EXISTING_TASKS`, `AIF_REQUIREMENTS_MAX_QUESTIONS_PER_CYCLE`, `AIF_REQUIREMENTS_MAX_CYCLES`, and `AIF_REQUIREMENTS_AUTO_RESUME_ON_ANSWER`.

2. Persistence:
   - [ ] Add Drizzle table definitions and task columns in `packages/shared/src/schema.ts`.
   - [ ] Update `packages/shared/src/db.ts` table bootstrap, migrations, and indexes.
   - [ ] Update `packages/data/src/index.ts` row mapping and task update helpers for new task fields.
   - [ ] Add question repository helpers: list by task, list grouped batches, create batch/questions, answer single/batch, open blocking count, duplicate answered idempotency guard, and active-batch resume checks.

3. State transitions:
   - [ ] Keep `packages/shared/src/stateMachine.ts` browser-safe; do not import `getEnv()`.
   - [ ] Update `applyHumanTaskEvent` to accept a pure option for requirements-intake routing, or route via server-side caller logic before applying the transition.
   - [ ] Update `start_ai` to route to `requirements_analysis` only when the explicit intake option is true.
   - [ ] Add Phase 1 human events for requirements reanalysis and manual requirements approval.
   - [ ] Ensure `/tasks/:id/events` cannot use `submit_answers` to bypass unanswered questions.
   - [ ] Keep legacy routing when `AIF_REQUIREMENTS_INTAKE_ENABLED=false`.

4. API:
   - [ ] Add Zod schemas for question creation and answer submission in `packages/api/src/schemas.ts`.
   - [ ] Add question endpoints in `packages/api/src/routes/tasks.ts`.
   - [ ] Broadcast `task:questions_created`, `task:question_answered`, `task:question_batch_answered`, `task:needs_input`, and `agent:wake` at the right points.
   - [ ] Ensure answer endpoints reject wrong-task questions, closed questions, invalid answer types, secret-like answers, and unsafe agent question shapes.
   - [ ] Make the batch-answer endpoint the only auto-resume path; it must re-count open blocking questions before moving `needs_input -> requirements_analysis`.
   - [ ] Add a regression test that direct `/tasks/:id/events` with `submit_answers` or an equivalent unsupported event cannot move a task out of `needs_input`.

5. Agent/coordinator:
   - [ ] Add `packages/agent/src/subagents/requirementsAnalyst.ts`.
   - [ ] Add requirements analyst stage before planner in `packages/agent/src/coordinator.ts`.
   - [ ] After `runRequirementsAnalyst`, re-read the task; if it moved to `needs_input` or any non-`requirements_analysis` status, skip the generic success transition to `planning`.
   - [ ] Update runtime stage mapping where necessary.
   - [ ] Update scheduler and auto-queue backlog advancement to target `requirements_analysis` when intake is enabled.
   - [ ] Update stale-stage/watchdog active statuses if they are typed locally outside coordinator/data.

6. UI:
   - [ ] Add API client methods and React Query hooks for task questions and batch answers.
   - [ ] Add `packages/web/src/components/task/QuestionsPanel.tsx`.
   - [ ] Render the panel in task detail for `needs_input` or open questions.
   - [ ] Add basic badges/overview rows for `needsInputStage` and blocking question counts if already loaded.

7. Tests:
   - [ ] Extend shared state machine and DB tests.
   - [ ] Add API tests for question list, answer validation, batch auto-resume, and secret-like rejection.
   - [ ] Add agent/coordinator tests for vague task -> needs_input and answered batch -> requirements_analysis.
   - [ ] Add focused web tests for `QuestionsPanel` rendering/submission if existing test harness supports it without broad fixture churn.

## Acceptance criteria

- [ ] With intake enabled, `start_ai` moves a backlog task to `requirements_analysis`, not `planning`.
- [ ] A vague feature/general task in `requirements_analysis` creates structured blocking questions and moves to `needs_input`.
- [ ] Each question has `id`, `stage`, `question`, `whyNeeded`, `blocking`, `answerType`, and `status`.
- [ ] The coordinator does not pick up `needs_input` tasks.
- [ ] Requirements analyst-created `needs_input` is not overwritten by the coordinator success transition.
- [ ] Answering all blocking questions in the active batch with `autoResume=true` moves the task back to `requirements_analysis` and broadcasts `agent:wake`.
- [ ] Answering only some blocking questions leaves the task in `needs_input`.
- [ ] Direct generic task events cannot move `needs_input` to `requirements_analysis` without completed blocking answers.
- [ ] Previously answered idempotency keys are not asked again by the deterministic requirements analyst.
- [ ] Obvious secret-like answers are rejected.
- [ ] With `AIF_REQUIREMENTS_INTAKE_ENABLED=false`, legacy `start_ai` and backlog auto-advance still route to `planning`.

## Verification plan

Run after `PLAN PASS` and implementation:

- `npm.cmd test --workspace=@aif/shared`
- `npm.cmd test --workspace=@aif/data`
- `npm.cmd test --workspace=@aif/api`
- `npm.cmd test --workspace=@aif/agent`
- `npm.cmd test --workspace=@aif/web`
- `npm.cmd run build`

Independent gates:

- [ ] Independent plan review returns explicit `PLAN PASS`.
- [ ] Independent tester runs the verification plan and returns explicit `TEST PASS`.
- [ ] Independent final reviewer reviews changed code against acceptance criteria and returns explicit `REVIEW PASS`.

## Reusable patterns

- Keep intake product questions separate from technical runtime blocking.
- Keep new DB features idempotent across Drizzle schema, manual bootstrap, migrations, and index bootstrap.
- Use deterministic local behavior for MVP tests around agent stages, with runtime-backed behavior preserved behind the same runner contract.
