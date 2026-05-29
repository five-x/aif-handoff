# Design

## Goal

Make product clarification a first-class downstream lifecycle contract. Any lifecycle agent that cannot continue because a product answer is missing should emit the same structured `raise_questions` contract, which the task runner converts into requirement-question rows and a `needs_input` task status. Non-product failures continue to use the existing blocked paths.

## Contract

Add a shared `aif-raise-questions` fenced JSON contract in `@aif/shared`:

```json
{
  "version": 1,
  "action": "raise_questions",
  "stage": "planning",
  "targetResumeStage": "planning",
  "reason": "A product decision is required before planning can continue.",
  "questions": [
    {
      "idempotencyKey": "planning-missing-acceptance-detail",
      "question": "What observable behavior should count as done?",
      "whyNeeded": "The plan cannot choose verification steps without acceptance detail.",
      "blocking": true,
      "answerType": "textarea",
      "placeholder": "Describe expected behavior and testable outcomes."
    }
  ]
}
```

Rules:

- `stage` and `targetResumeStage` use existing requirement question stages.
- `targetResumeStage` defaults to `stage`.
- `questions` must be non-empty, valid requirement-question inputs.
- Raw secret requests are rejected through the existing requirement question validation.
- The contract is for product clarification only. Runtime, infrastructure, permission, external access, malformed output, and review safety failures remain `blocked_external` or existing review/rework paths.

## Data and API

- Reuse the existing `task_requirement_questions` table and `targetResumeStage` column.
- Keep `answerTaskRequirementQuestionBatch` as the source of truth for active-batch resume.
- Add shared helpers so agent stages do not each hand-roll question normalization.
- Include `targetResumeStage` in question WebSocket payloads and API batch-answer payloads where the active batch is known.
- UI should show both the asking stage and the resume target for the active batch.

## Agent routing

- Add a small agent-side helper that detects the shared contract in a stage result, creates a blocking question batch, and returns whether it handled the result.
- Research/design: prefer the new shared contract while preserving the existing `status: "questions"` artifact path for compatibility.
- Planner: check the raw planner result for `aif-raise-questions` before reading/persisting a plan. If found, create the batch and return without a plan handoff.
- Implementer: check the result before blocked-result handling and before persisting implementation logs. If found, create the batch and return without review handoff.
- Reviewer: check sidecar outputs before structured review parsing. If found, create the batch and return without review-gate handoff.
- QA: check the QA result before parsing `aif-qa-artifact`; if found, create the batch and return without `blocked_external`.
- Coordinator: treat `needs_input` updates from any lifecycle runner as terminal for that poll iteration and do not overwrite them with normal success routing.

## Compatibility

- When requirements intake is disabled, normal start routing remains legacy. The shared contract helper should avoid creating question batches and should fail closed as `blocked_external` only if a disabled-mode runner somehow emits the contract.
- Existing requirements-analysis behavior remains unchanged.
- Existing `aif-stage-artifact` research/design question behavior remains accepted as a compatibility path.

## Verification design

- Unit tests cover contract parsing and validation in shared code.
- Data tests cover target resume for all late stages.
- Agent tests cover shared contract handling in research/design, planning, implementation, review, and QA.
- Coordinator tests cover non-overwrite behavior for planner, implementer, reviewer, and QA `needs_input` transitions.
- Disabled-intake tests prove a runner-emitted `raise_questions` contract cannot create question batches when `AIF_REQUIREMENTS_INTAKE_ENABLED=false`, and legacy start/processing behavior remains unchanged.
- API/Web tests cover target resume payload/display.
