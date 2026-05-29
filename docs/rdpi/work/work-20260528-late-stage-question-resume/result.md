<!-- Managed by RDPI for task work-20260528-late-stage-question-resume. -->

# Result - Late Stage Question Resume

## Outcome

Implemented unified downstream product-clarification routing for requirements intake stages after initial analysis.

Research, design, planning, implementing, review, and QA can now surface product clarification questions through a structured `aif-raise-questions` contract, or through the existing research/design stage-question path. Product clarification pauses the task in `needs_input` with an active question batch and `targetResumeStage`; answering the batch resumes the intended stage. Runtime, infrastructure, access, operator, and non-product failures remain on `blocked_external` or existing manual-review paths.

Compatibility is preserved when `AIF_REQUIREMENTS_INTAKE_ENABLED=false`: late-stage question contracts and research/design legacy question outputs do not create question rows, and API-created questions are rejected before persistence.

## Implemented Changes

- Added a shared `aif-raise-questions` contract, parser, normalizer, and exports in `@aif/shared`.
- Added stage prompt guidance and a shared agent handler that routes product clarification to requirement question batches.
- Wired question handling into research, design, planning, implementing, review, and QA runners before normal artifact/success parsing.
- Preserved disabled-intake behavior by blocking agent-emitted product questions without inserting question rows.
- Guarded API-created requirement questions when intake is disabled.
- Added `targetResumeStage` to question websocket/API payloads and surfaced the resume target in the task question panel.
- Added coordinator handling so `needs_input` produced by downstream stages is not overwritten by normal stage handoff.

## Gate Outcomes

- `PLAN FAIL`: initial plan review required disabled-intake coverage and explicit planner/implementer/reviewer coverage.
- `PLAN PASS`: revised plan passed independent review.
- Initial `REVIEW FAIL`: reviewer found disabled-intake bypasses in research/design legacy stage questions and API-created questions.
- Initial `TEST FAIL`: tester's implementation checks passed, but the tester invalidated the gate after running one malformed Vitest command.
- Final `TEST PASS`: independent tester passed all required checks after disabled-intake fixes.
- Final `REVIEW PASS`: independent reviewer confirmed the prior blockers were fixed and found no blocking issues.

## Review Fixes

- Added a disabled-intake guard to research/design `aif-stage-artifact` `status: "questions"` handling.
- Added regression tests proving research and design legacy question output blocks without question rows when intake is disabled.
- Added an API disabled-intake guard for `POST /tasks/:id/questions`.
- Added an API regression test proving disabled intake rejects manual question creation without inserts or broadcasts.
- Corrected generated prompt guidance to use the parser-supported `aif-raise-questions` fence language.

## Verification

Passed locally:

- `npm.cmd test --workspace=@aif/agent -- lateStageQuestionResume coordinatorLateStageQuestionResume researchDesignStage qaStage coordinatorResearchDesignStages coordinatorQaGate`
- `npm.cmd test --workspace=@aif/data -- requirementsQuestions`
- `npm.cmd test --workspace=@aif/api -- tasks`
- `npm.cmd test --workspace=@aif/web -- QuestionsPanel TaskDetail`
- `npm.cmd run build`
- `npm.cmd run lint`
- `git diff --check`

Independent tester passed:

- `npm.cmd test --workspace=@aif/agent -- lateStageQuestionResume coordinatorLateStageQuestionResume researchDesignStage qaStage coordinatorResearchDesignStages coordinatorQaGate`
- `npm.cmd test --workspace=@aif/data -- requirementsQuestions`
- `npm.cmd test --workspace=@aif/api -- tasks`
- `npm.cmd test --workspace=@aif/web -- QuestionsPanel TaskDetail`
- `npm.cmd run build`
- `npm.cmd run lint`

Independent reviewer passed:

- `npm.cmd run test --workspace=@aif/agent -- src/__tests__/lateStageQuestionResume.test.ts src/__tests__/coordinatorLateStageQuestionResume.test.ts`
- `npm.cmd run test --workspace=@aif/api -- src/__tests__/tasks.test.ts`
- `npm.cmd run test --workspace=@aif/web -- src/__tests__/QuestionsPanel.test.tsx`

Notes:

- `npm.cmd run lint` exits 0 with an existing non-fatal warning in `packages/agent/src/subagents/reviewer.ts:1342`.
- Agent tests emit expected local notifier fetch failures to `localhost:3009`; tests passed.
- No live browser/manual UI check was run; coverage is through focused web tests, full build, and independent gates.

## Memory Sync

- `python "$env:USERPROFILE\.codex\tools\codex-memsync.py" --repo . --mode auto --lane work --task-id work-20260528-late-stage-question-resume --project aif-handoff --entity aif-handoff` completed.
- Report: `docs/memory/reports/work-20260528-late-stage-question-resume-memsync-report.md`.
- Sync status: `skipped`.
- Reason: `no publishable curated documents`.
- Generated local artifacts include the task delta, project capsule, entity capsule, and memory sync report.
