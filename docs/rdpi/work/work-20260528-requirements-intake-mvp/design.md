<!-- Managed by RDPI for task work-20260528-requirements-intake-mvp. -->

# Design

## Chosen design

Implement a narrow core clarification loop without changing downstream execution semantics beyond the new entry stage:

```text
backlog --start_ai/auto_queue/scheduler--> requirements_analysis
requirements_analysis --questions_required--> needs_input
needs_input --batch answers submitted and complete(autoResume)--> requirements_analysis
requirements_analysis --requirements_ready--> planning
```

The MVP stores questions as first-class rows and treats `needs_input` as a normal product status. `blocked_external` remains reserved for runtime/infrastructure/manual technical blocks.

## Data model

Add `task_requirement_questions` with the fields required by the MVP plus `target_resume_stage` and `idempotency_key`:

- identifiers and scope: `id`, `task_id`, `project_id`, `batch_id`;
- lifecycle: `stage`, `target_resume_stage`, `cycle_number`, `status`;
- question contract: `idempotency_key`, `question`, `why_needed`, `blocking`, `answer_type`, `options_json`, `default_answer`, `placeholder`;
- answer fields: `answer`, `answer_attachments_json`, `answer_author`, `answered_at`;
- resolution/source fields: `resolved_at`, `resolution_note`, `source_agent`, `source_prompt_hash`;
- timestamps.

Add task fields:

- `requirements_cycle_count`;
- `requirements_confidence`;
- `requirements_snapshot_id`;
- `needs_input_batch_id`;
- `needs_input_stage`;
- `needs_input_reason`;
- `last_human_answer_at`;
- `last_auto_resume_at`.

`qa_status` is out of Phase 1 because QA gate is Phase 3.

## Shared contracts

Extend:

- `TaskStatus` with `requirements_analysis` and `needs_input`;
- `TaskEvent` with `request_requirements_reanalysis` and `approve_requirements` for backend readiness;
- `WsEventType` with question and requirements events required by the MVP;
- browser-safe exports for new question row/response/input types.

Add a small `requirementsQuestions.ts` shared module with:

- allowed stage list;
- answer type list;
- status list;
- validation helpers for answers and secret-like values.

## State machine

`applyHumanTaskEvent`:

- stays browser-safe and does not import `getEnv()`;
- takes an optional pure transition option such as `{ requirementsIntakeEnabled?: boolean }`, or server callers select the target before invoking the pure transition;
- `start_ai` returns `requirements_analysis` only when the explicit option is true, otherwise preserves legacy `planning`;
- no generic `submit_answers` task event is exposed in Phase 1 because `/tasks/:id/events` cannot carry or validate answer completion;
- `request_requirements_reanalysis` can move `backlog`, `planning`, `plan_ready`, or `done` into `requirements_analysis` only when the explicit intake option is true;
- `approve_requirements` can move `requirements_analysis` to `planning` for manual override/readiness.

`HUMAN_ACTIONS_BY_STATUS`:

- `requirements_analysis`: optional `approve_requirements`;
- `needs_input`: no generic event; answers must flow through the question answer endpoints;
- existing statuses unchanged.

Server-side event handling:

- `packages/api/src/services/taskEvents.ts` passes the explicit intake option from `getEnv()` into `applyHumanTaskEvent` for normal events.
- `/tasks/:id/events` must reject any unknown/legacy `submit_answers` value. The only auto-resume path is the batch-answer endpoint, which checks open blocking questions before moving the task.

## API

Implement within `tasksRouter` for MVP:

- `GET /tasks/:id/questions`;
- `POST /tasks/:id/questions/:questionId/answer`;
- `POST /tasks/:id/question-batches/:batchId/answers`;
- `POST /tasks/:id/questions` for agent/tooling;
- `POST /tasks/:id/requirements/reanalyze`.

The batch answer endpoint:

- validates task and batch ownership;
- validates answer type;
- blocks obvious secret-like answer values;
- writes answers;
- if all blocking questions in the active batch are answered and `autoResume=true`, updates task from `needs_input` to `requirements_analysis`, clears active needs-input fields, writes `lastHumanAnswerAt` and `lastAutoResumeAt`, appends activity, broadcasts `task:question_batch_answered`, `task:moved`, and `agent:wake`.

## Requirements analyst runner

Add `packages/agent/src/subagents/requirementsAnalyst.ts`.

Runner behavior:

- loads task and existing questions/comments;
- if deterministic readiness can identify missing blocking fields, creates structured questions without a runtime call;
- otherwise calls the runtime with strict JSON instructions and validates output;
- on `need_input`, persists one batch and moves task to `needs_input`;
- on ready decision, appends an activity note and lets coordinator transition to `planning`;
- invalid runtime output throws, so coordinator routes to `blocked_external`.

MVP deterministic fallback:

- for very short feature/general descriptions, ask up to three blocking questions: primary user/actor, desired behavior/scope, and acceptance criteria;
- skip any question whose idempotency key has already been answered;
- if no blocking questions are needed, return ready.

This fallback is deliberately conservative and gives tests deterministic behavior while preserving the runtime-backed agent contract.

## Coordinator

Add a pipeline stage:

```ts
{
  from: ["requirements_analysis"],
  inProgress: "requirements_analysis",
  onSuccess: "planning",
  runner: runRequirementsAnalyst,
  label: "requirements-analyst",
}
```

Because `needs_input` is not in any candidate selector, the coordinator will not process it. Candidate selection and lock typing must accept the new coordinator label.

After the requirements analyst runner returns, the coordinator must re-read the task before applying `stage.onSuccess`:

- if the task status is `needs_input`, keep it there, release the lock, and return without applying `planning`;
- if the task status is no longer `requirements_analysis` for any other reason, do not overwrite that newer status;
- only apply `onSuccess: "planning"` when the latest status is still `requirements_analysis`.

This mirrors existing terminalization patterns where a runner may intentionally move a task to another status before the generic success transition.

Update backlog advancement paths:

- `claimBacklogTaskForAdvance` accepts an explicit target status or intake-enabled option from server-side callers and writes `requirements_analysis` when intake is enabled;
- scheduler and auto-queue broadcasts report the actual target status;
- active pipeline count includes `requirements_analysis` and, by default, `needs_input`.

## UI

MVP UI changes:

- add statuses/colors to `STATUS_CONFIG` and `ORDERED_STATUSES`;
- add `QuestionsPanel` in the task detail left column when the task has open questions or status is `needs_input`;
- add hooks/API methods for question list and batch answer;
- show stage, reason, blocking count, inputs, and submit button;
- invalidate task/questions queries after answer submission.

The existing `Artifacts` tab remains unchanged in Phase 1.

## Security

- Validate attachment refs as JSON but do not add upload flow to question answers in MVP.
- Reject answer text containing obvious secret material such as private-key headers, bearer tokens, `password=`, `api_key=`, `secret=`, or long token-like values.
- Agent-created questions must include non-empty `whyNeeded`.
- Agent-created secret requests should be rejected if the question asks for raw password/token/API key rather than a credential reference.

## Pre-PLAN boundary

Before `PLAN PASS`, only RDPI planning files are changed. No implementation, runtime service checks, DB inspection, memory recall, live endpoint checks, or test execution are performed.

## Decision candidates

- `needs_input` is a product status, not a `blocked_external` subtype.
- Requirement questions are persisted rows, not comments.
- Auto-resume after all blocking answers is default behavior.
