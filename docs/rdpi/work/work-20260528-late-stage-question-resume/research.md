# Research

## Task framing and lane

- Task ID: `work-20260528-late-stage-question-resume`
- Lane: `work`
- Intake card: `docs/intake/work/work-20260528-late-stage-question-resume.md`
- Request: unify downstream structured question handling across research, design, planning, implementation, review, and QA with a shared `raise_questions` contract, `needs_input` routing, and target-stage resume after all blocking answers are provided.
- Scope boundary: this task may implement the selected card only. It must not create or execute follow-up child tasks.

## Accepted planning sources or local facts

- Repo instructions require RDPI and independent gates for non-trivial implementation.
- `codex-ensure-rdpi.py` returned `STATUS: refreshed`; `codex-flow-audit.py --repo .` returned `STATUS: clean`.
- Current task statuses include `needs_input`, `research`, `design`, `planning`, `implementing`, `review`, `qa`, and `blocked_external` in `packages/shared/src/types.ts`.
- Current question stages already include `requirements_analysis`, `research`, `design`, `planning`, `implementing`, `review`, `qa`, and `acceptance` in `packages/shared/src/requirementsQuestions.ts`.
- Current question persistence already stores `targetResumeStage` in `packages/shared/src/schema.ts`.
- Data-layer resume already maps `requirements_analysis`, `research`, `design`, `planning`, `implementing`, `review`, and `qa` to task statuses in `packages/data/src/index.ts`.
- Completing an active blocking batch can already clear `needsInput*`, unlock the task, set the resume status, and let the API broadcast `agent:wake`.
- Existing requirements analyst asks template-driven product questions and routes those to `needs_input`; cycle exhaustion still routes to `blocked_external`.
- Existing research/design runners use a bespoke `aif-stage-artifact` `status: "questions"` path and route questions to `needs_input`.
- Existing planner, implementer, reviewer, and QA prompts do not share a structured product-question contract.
- Existing QA `blocked` and `failed` outputs route to `blocked_external`; there is no product-clarification path.
- Existing API and WebSocket question payloads surface active batch stage/open counts but not a clear resume target.
- Existing UI `QuestionsPanel` displays the active question batch stage but not `targetResumeStage`.

## Same-project memory

Not consulted. The project RDPI boundary forbids shared-memory recall before `PLAN PASS` unless the user explicitly waives that boundary.

## Cross-project reusable patterns

Not consulted for the same pre-`PLAN PASS` boundary.

## Rejected or stale memory candidates

None consulted.

## Risks and constraints

- Product clarification must route to `needs_input`; runtime, infrastructure, access, permission, and external operator failures must remain `blocked_external`.
- Planner, implementer, and reviewer changes are sensitive because the coordinator currently expects those stages to hand off to later statuses after a successful runner call.
- The implementation must preserve compatibility when `AIF_REQUIREMENTS_INTAKE_ENABLED=false`.
- The worktree already contains many uncommitted prerequisite changes. This task must avoid broad formatting or unrelated file churn.

## Proposed verification plan

- Shared parser/normalizer tests for the `raise_questions` contract, including target stages and secret-question rejection.
- Data tests proving complete active batches resume to `planning`, `implementing`, `review`, and `qa` in addition to existing requirements/research/design coverage.
- Agent tests proving research/design and QA can emit shared product questions to `needs_input`.
- Coordinator tests proving planner/implementer/reviewer/QA `needs_input` transitions are not overwritten by normal success routing.
- API/UI tests proving active question state includes and displays `targetResumeStage`.
