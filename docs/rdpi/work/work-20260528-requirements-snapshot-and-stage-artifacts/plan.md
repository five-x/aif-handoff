<!-- Managed by RDPI for task work-20260528-requirements-snapshot-and-stage-artifacts. -->

# Plan - Requirements Snapshot And Stage Artifacts

## Gate Plan

- [x] Complete local research and design artifacts.
- [ ] Send this plan plus task input, research, and design to an independent reviewer.
- [ ] If review returns `PLAN FAIL`, revise research/design/plan and rerun the gate.
- [ ] Start implementation only after `PLAN PASS`.

## Implementation Steps

- [ ] Shared schema and types:
  - Add `taskRequirementsSnapshots`, `taskStageArtifacts`, and `taskStageArtifactAttempts` schema definitions.
  - Add SQLite bootstrap DDL and migration.
  - Extend generic artifact kinds with `requirements`, `research`, and `design`.
  - Add snapshot/stage artifact DTOs to shared exports.
- [ ] Data layer:
  - Add snapshot markdown generation with secret-like redaction.
  - Add current snapshot create/list/read helpers.
  - Add stage artifact current/attempt helpers and waiver helper.
  - Extend `buildTaskWorkflowTimeline()` so task-stage artifacts appear alongside existing generic task-record artifacts.
  - Add a bounded prompt-context helper for snapshot and upstream artifact metadata.
- [ ] Agent integration:
  - Make `runRequirementsAnalyst()` create a current snapshot only after requirements are sufficient.
  - Add a planner-stage guard that requires a current snapshot or waiver only when `AIF_REQUIREMENTS_INTAKE_ENABLED=true`.
  - Missing-snapshot guard behavior: do not execute the planner, move the task back to `requirements_analysis`, clear stale external-block fields, append an activity-log explanation, and wake the coordinator. Do not set `needs_input` directly and do not set `blocked_external`.
  - Add snapshot/artifact context to planner, implementer, and reviewer prompts through a stage-neutral helper that future QA can reuse.
- [ ] API exposure:
  - Add `GET /tasks/:id/requirements/snapshot`.
  - Ensure the endpoint returns current snapshot or `null`, version metadata, current artifacts, artifact attempts, redaction-safe fields, and a 200 empty response for existing no-snapshot tasks.
  - Broadcast timeline and requirements-snapshot events after snapshot/artifact mutations where route-level writes occur.
- [ ] Web exposure:
  - Add API client/hook support for the snapshot endpoint if required by tests.
  - Ensure the existing Timeline and Artifacts tabs render `requirements`, `research`, and `design` artifact metadata cleanly.

## Acceptance Criteria

- [ ] Creating a requirements snapshot versions task requirements and updates `tasks.requirements_snapshot_id`.
- [ ] Snapshot markdown redacts secret-like values and does not persist raw unsafe answers.
- [ ] `requirements.md` is exposed as artifact metadata with current and attempt records.
- [ ] `research.md` and `design.md` metadata can be recorded through the same stage-artifact helper and appears in the timeline.
- [ ] Planner execution cannot proceed with intake enabled unless a current requirements snapshot or documented waiver exists.
- [ ] When the enabled planner guard finds no current snapshot or waiver, planner is not called, task status returns to `requirements_analysis`, `needs_input` is not set by the guard, and `blocked_external` is not used.
- [ ] Planner execution still follows legacy behavior when `AIF_REQUIREMENTS_INTAKE_ENABLED=false`.
- [ ] `GET /tasks/:id/requirements/snapshot` exposes current snapshot or `null`, all snapshot version metadata, current stage artifacts, artifact attempts, and redaction-safe fields; unknown tasks return 404.
- [ ] Planner, implementer, reviewer, and future QA prompt inputs can reference current snapshot and upstream artifact metadata through the same bounded helper contract.
- [ ] Existing Phase 1 requirements questions, answer validation, `needs_input`, and auto-resume behavior remain unchanged.
- [ ] Audit/roadmap compatibility tables and trust mappings are not weakened or repurposed.

## Verification Commands

- [ ] `npm.cmd test --workspace=@aif/data -- --run src/__tests__/requirementsQuestions.test.ts src/__tests__/workflowTimeline.test.ts`
- [ ] `npm.cmd test --workspace=@aif/agent -- --run src/__tests__/coordinator.test.ts src/__tests__/planner.test.ts`
- [ ] `npm.cmd test --workspace=@aif/api -- --run src/__tests__/tasks.test.ts`
- [ ] `npm.cmd test --workspace=@aif/web -- --run src/__tests__/WorkflowTimelinePanel.test.tsx src/__tests__/TaskDetail.test.tsx`
- [ ] `npm.cmd run build`

## Required Test Cases

- [ ] Data: snapshot creation redacts secret-like answers, increments versions, updates the task pointer, and records `requirements.md` current/attempt rows.
- [ ] Data: `research.md` and `design.md` stage artifact helper writes current rows and append-only attempts without touching audit roadmap tables.
- [ ] Data: timeline projection includes `requirements`, `research`, and `design` artifacts with expected state/outcome/trust metadata.
- [ ] Data: prompt-context helper returns a bounded, stage-neutral block suitable for planner, implementer, reviewer, and future QA callers.
- [ ] Agent/coordinator: enabled planner guard with no snapshot or waiver does not call planner, returns the task to `requirements_analysis`, does not set `needs_input`, and does not set `blocked_external`.
- [ ] Agent/coordinator: disabled requirements intake preserves legacy planning execution without requiring a snapshot.
- [ ] API: `GET /tasks/:id/requirements/snapshot` returns current snapshot, all snapshot version metadata, current artifacts, attempts, and redaction-safe fields.
- [ ] API: the snapshot endpoint returns `current: null` and empty arrays for an existing task without a snapshot, and 404 for an unknown task.
- [ ] Web: timeline/artifacts surfaces render `requirements.md`, `research.md`, and `design.md` artifact labels, paths, states, and attempts.

## Close-Out Plan

- [ ] Record implementation summary, changed files, gate outcomes, and verification output in `result.md`.
- [ ] Run independent tester and require `TEST PASS`.
- [ ] Run independent final reviewer and require `REVIEW PASS`.
- [ ] Run `$memsync MODE=auto LANE=work TASK_ID=work-20260528-requirements-snapshot-and-stage-artifacts`.
- [ ] Mark only this task's `docs/intake/work_status.json` entry `done` after local memory review succeeds.
