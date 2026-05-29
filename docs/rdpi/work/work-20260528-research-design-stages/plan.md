<!-- Managed by RDPI for task work-20260528-research-design-stages. -->

# Plan - Research And Design Stages

## Implementation plan

1. Plan review gate:
   - [x] Send the task card plus `research.md`, `design.md`, and this `plan.md` to an independent reviewer.
   - [x] Require explicit `PLAN PASS` before source edits.
   - [x] If review returns `PLAN FAIL`, revise design/plan and rerun the gate.

2. Shared lifecycle contracts:
   - [x] Add `research` and `design` to `TASK_STATUSES`.
   - [x] Add `researcher` and `designer` to `COORDINATOR_STAGES`.
   - [x] Update `STATUS_CONFIG`, `ORDERED_STATUSES`, active pipeline status sets, branch-bound active status sets, and requirement resume status mapping.
   - [x] Add `AIF_REQUIREMENTS_RESEARCH_DESIGN_ENABLED` with default `false`.
   - [x] Update state-machine/options tests so Phase 1 disabled and default behavior remain unchanged.

3. Data-layer artifact gates and prompt context:
   - [x] Add helper(s) to evaluate accepted or waived research/design artifacts.
   - [x] Make prompt context include upstream artifacts by lifecycle order instead of exact-stage filtering.
   - [x] Add tests for accepted artifact, manual waiver, missing/invalid artifact, and planner context including requirements plus research/design metadata.

4. Research/design runners:
   - [x] Add shared strict parser for exactly one fenced `aif-stage-artifact` JSON block.
   - [x] Add `runResearcher` and `runDesigner` runners.
   - [x] Persist accepted artifacts through `recordTaskStageArtifactAttempt`.
   - [x] Create stage-local requirement question batches for `questions` output and move product clarification to `needs_input`.
   - [x] Record rejected/blocked attempts for invalid or blocked outputs without treating product clarification as `blocked_external`.
   - [x] Add unit tests for accepted output, malformed output, blocked output, and structured questions.

5. Coordinator integration:
   - [x] Insert `researcher` and `designer` stages into the pipeline only when the new flag is enabled.
   - [x] Preserve `requirements_analysis -> planning` when the new flag is disabled.
   - [x] Generalize runner-updated-status handling so research/design-created `needs_input` is not overwritten.
   - [x] Extend planner guard to require current requirements, accepted/waived research, and accepted/waived design when the new flag is enabled.
   - [x] Route missing research to `research` and missing design to `design`, not `needs_input` or `blocked_external`.

6. API/UI compatibility:
   - [x] Update any status schemas, grouping fixtures, and UI status columns impacted by the two new statuses.
   - [x] Reuse existing requirements snapshot/timeline/artifacts endpoints for research/design artifact readback.
   - [x] Add focused web tests only where status ordering/grouping or artifact rendering needs updated fixtures.

7. RDPI close-out:
   - [x] Run targeted package tests and full build/lint if feasible.
   - [x] Require independent `TEST PASS`.
   - [x] Require independent `REVIEW PASS`.
   - [x] Create `result.md` with gate outcomes and verification evidence.
   - [x] Run `$memsync MODE=auto LANE=work TASK_ID=work-20260528-research-design-stages`.
   - [x] Mark only the matching `docs/intake/work_status.json` entry `done` after local memory review succeeds.

## Acceptance criteria

- Research/design stages exist behind `AIF_REQUIREMENTS_RESEARCH_DESIGN_ENABLED=false` by default.
- With `AIF_REQUIREMENTS_INTAKE_ENABLED=false`, tasks still route to planning without requirements, research, or design gates.
- With requirements intake enabled and research/design disabled, Phase 1 behavior remains unchanged.
- With both flags enabled, successful requirements analysis routes through `research` and `design` before `planning`.
- Research/design runners produce validated `research.md`/`design.md` stage artifacts or structured blocking questions.
- Blocking product questions from research/design use `needs_input` with stage-local resume targets.
- Planner execution is blocked from proceeding when required research/design artifacts are missing or invalid unless a documented waiver exists.
- Planner prompt context includes current requirements plus accepted/waived research and design artifacts.

## Verification plan

Targeted commands after implementation:

- `npm.cmd test --workspace=@aif/shared -- --run src/__tests__/stateMachine.test.ts src/__tests__/env.test.ts`
- `npm.cmd test --workspace=@aif/data -- --run src/__tests__/requirementsQuestions.test.ts src/__tests__/workflowTimeline.test.ts`
- `npm.cmd test --workspace=@aif/agent -- --run src/__tests__/coordinator.test.ts src/__tests__/coordinatorRequirementsSnapshotGuard.test.ts src/__tests__/planner.test.ts`
- Add and run focused agent runner tests for research/design contracts.
- Run affected web tests if status ordering or artifact fixtures change: `npm.cmd test --workspace=@aif/web -- --run src/__tests__/WorkflowTimelinePanel.test.tsx src/__tests__/TaskDetail.test.tsx`.
- `npm.cmd run build`
- `npm.cmd run lint`
- `git diff --check`

Independent gates:

- `PLAN PASS` from reviewer before source edits.
- `TEST PASS` from tester after implementation and local verification.
- `REVIEW PASS` from final reviewer before result/memsync close-out.

## Reusable patterns

- Use a versioned fenced JSON contract for stage runner outputs.
- Keep missing-artifact planner guards as routing decisions, while product clarification remains `needs_input` and infrastructure/manual failures remain `blocked_external`.
