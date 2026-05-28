<!-- Managed by RDPI for task work-20260528-requirements-intake-remaining-phases. -->

# Plan

## Implementation plan

1. Independent plan review:
   - [x] Send the task card plus `research.md`, `design.md`, and this `plan.md` to an independent reviewer.
   - [x] Require an explicit `PLAN PASS` before creating child cards.
   - [ ] If review returns `PLAN FAIL`, revise `research.md`, `design.md`, and `plan.md`, then rerun the gate.

2. Create child intake cards and scaffolds:
   - [x] `work-20260528-requirements-snapshot-and-stage-artifacts`
   - [x] `work-20260528-research-design-stages`
   - [x] `work-20260528-qa-gate-and-acceptance-pack`
   - [x] `work-20260528-late-stage-question-resume`
   - [x] `work-20260528-roadmap-split-required`
   - [x] `work-20260528-requirements-observability-docs-rollout`

3. Update queue metadata:
   - [x] Add each child to `docs/intake/work_index.md`.
   - [x] Add each child to `docs/intake/work_status.json` with `status: "queued"`, priority based on dependency order, `rdpiNeeded: true`, and the matching `rdpiPath`.
   - [ ] Update only the parent `work-20260528-requirements-intake-remaining-phases` status entry to `done` after gates and memory local review succeed.

4. Result artifact:
   - [x] Create `docs/rdpi/work/work-20260528-requirements-intake-remaining-phases/result.md`.
   - [ ] Record `PLAN PASS`, `TEST PASS`, and `REVIEW PASS` outcomes.
   - [ ] Record that no platform source implementation was performed and child tasks remain required for feature completion.

5. Verification gate:
   - [x] Independent tester verifies the child cards, child RDPI scaffolds, parent result, status JSON validity, and absence of source-code changes.
   - [x] Require explicit `TEST PASS`.
   - [ ] If tester returns `TEST FAIL`, fix the intake/RDPI artifacts and rerun the tester.

6. Final review gate:
   - [x] Independent reviewer verifies the decomposition matches the parent card, no child task was executed, status updates are scoped, and result wording does not overclaim feature completion.
   - [x] Require explicit `REVIEW PASS`.
   - [ ] If reviewer returns `REVIEW FAIL`, fix the artifacts and rerun any invalidated gate.

7. Memory sync:
   - [x] Run `$memsync MODE=auto LANE=work TASK_ID=work-20260528-requirements-intake-remaining-phases`.
   - [x] Mark the parent task `done` only after local memory review succeeds.
   - [x] Treat shared-memory publish warnings after successful local review as warnings, not as a task blocker.

## Child task acceptance criteria

### `work-20260528-requirements-snapshot-and-stage-artifacts`

- Durable requirements snapshots exist and version task requirements without storing secrets or raw unsafe answers.
- Non-trivial tasks can expose `requirements.md`, `research.md`, and `design.md` artifact metadata through backend APIs and UI.
- Planner, implementer, reviewer, and QA gate inputs can reference the current requirements snapshot and relevant upstream artifacts.
- Downstream stages cannot proceed without a current snapshot or explicit documented waiver.

### `work-20260528-research-design-stages`

- Research and design coordinator stages exist behind rollout-safe configuration.
- Research/design runners produce validated artifacts and can raise structured blocking questions.
- Planner receives requirements, research, and design references.
- Existing Phase 1 requirements behavior remains unchanged when research/design stages are disabled.

### `work-20260528-qa-gate-and-acceptance-pack`

- QA stage/status and QA runner exist when QA is enabled.
- `review -> qa -> done` is enforced; direct `review -> done` is blocked when QA is required.
- QA produces `qa.md`, records command evidence/skips with reason and risk, and blocks done on failed mandatory checks.
- Done produces an acceptance/result pack with covered requirements, changed files, review result, QA result, limitations, rollback notes, and readiness for human acceptance.
- `verified` remains reachable only through human approval.

### `work-20260528-late-stage-question-resume`

- Research, design, planning, implementation, review, and QA agents can emit a shared `raise_questions` contract.
- Product clarification routes to `needs_input`, not `blocked_external`.
- Answering all blocking questions resumes the correct target stage.
- Runtime/infrastructure failures continue to use `blocked_external`.

### `work-20260528-roadmap-split-required`

- Broad roadmap items can return `split_required`.
- Proposed child tasks are persisted separately from approved child tasks.
- UI/API require controlled human approval before children are created.
- Parent/child handling preserves queue gating and never executes generated children in the same approval flow.

### `work-20260528-requirements-observability-docs-rollout`

- Structured logs/metrics cover snapshot creation, stage artifact writes, question raises/resumes, QA gate decisions, split decisions, and acceptance-pack creation.
- Architecture, API, configuration, and runbook docs cover the full lifecycle and compatibility mode.
- Regression and e2e coverage spans Phase 2-4 happy paths and compatibility behavior when `AIF_REQUIREMENTS_INTAKE_ENABLED=false`.

## Verification commands

This umbrella task changes intake/RDPI/memory artifacts only, so the verification is document- and metadata-focused:

- `git status --short`
- PowerShell JSON parse for `docs/intake/work_status.json`
- `Test-Path` checks for all child intake cards and child RDPI scaffold files
- `rg -n` checks confirming no source files under `packages/` changed in this run

Child implementation tasks will own package-specific commands such as:

- `npm.cmd test --workspace=@aif/shared`
- `npm.cmd test --workspace=@aif/data`
- `npm.cmd test --workspace=@aif/api`
- `npm.cmd test --workspace=@aif/agent`
- `npm.cmd test --workspace=@aif/web`
- `npm.cmd run build`

## Out of scope

- Source implementation for Phases 2-4.
- Database migrations.
- Runtime service checks, scheduler reads, log reads, live endpoint checks, or downstream runtime/config reads.
- Shared-memory recall before `PLAN PASS`.
- Executing any child task created by this parent decomposition.

## Gate checklist

- [x] `PLAN PASS`
- [x] Child cards and scaffolds created
- [x] `TEST PASS`
- [x] `REVIEW PASS`
- [x] `memsync MODE=auto` local review succeeded
- [x] Parent status entry updated to `done`
