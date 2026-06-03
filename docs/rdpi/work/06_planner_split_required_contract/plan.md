# Plan

## Implementation Plan

1. Add `packages/shared/src/planningDecisionContract.ts`.
   - Define planning decision types and allowed decisions.
   - Parse fenced `aif-planning-decision` JSON.
   - Require exactly one valid decision block for model planner output.
   - Validate task id, decision, reason, and child proposal fields.
   - Export parser/normalizer from `packages/shared/src/index.ts`.

2. Add shared contract tests.
   - Valid `ready_plan` parses.
   - Valid `split_required` parses and normalizes children.
   - Invalid decision values are rejected.
   - `split_required` without valid proposed children is rejected.
   - Task id mismatch is rejected.
   - Missing decision block is rejected for model planner output.

3. Extend split proposal source typing.
   - Add `planner_decision` to `TaskSplitProposalSourceKind`.
   - Keep existing roadmap and implementation recovery source kinds compatible.

4. Update planner prompt and session reuse.
   - Instruct planner to emit `aif-planning-decision`.
   - Add deterministic split-required guidance for broad/vague/multi-subsystem/wildcard/dev-stack/unrelated-criteria/no-command tasks.
   - Compute `sessionReusePolicy` as `never` for planner retry/replan/blockedReason/quality feedback; keep `resume_if_available` for clean first-run.

5. Handle planner decision before plan persistence.
   - Parse the raw/disk planner output after raise-question handling.
   - If decision is `split_required`, create/reuse a pending split proposal and block the parent.
   - Use parent-specific proposal inputs: `sourceKind=planner_decision`, `roadmapAlias=planner-split:${taskId}`, `sourceRef=task:${taskId}:planner_decision`, and a stable source fingerprint derived from task metadata and proposed children.
   - On split proposal conflict, block with `split_required_conflict:` and do not advance.
   - Clear stale runnable parent plan text and canonical plan file via `persistTaskPlanForTask({ planText: null, ... })`.
   - Log the proposal id in activity.
   - If decision is invalid or missing for model planner output, throw before plan persistence.
   - If decision is `ready_plan`, continue existing normalization and plan-quality flow.

6. Update coordinator planner success handling.
   - After planner runner completion, preserve `blocked_external` planner outcomes whose `blockedReason` starts with `split_required:` or `split_required_conflict:`.
   - Broadcast the task move and return without applying generic success transition to `plan_ready`.

7. Add planner tests.
   - Broad task with planner `split_required` output creates a pending proposal, keeps parent out of `plan_ready`, clears/does not persist a runnable plan, and logs proposal id.
   - `split_required` cannot become `plan_ready`.
   - Replan from an existing runnable plan clears DB plan text and canonical plan file.
   - Invalid planning decision rejects and does not persist a plan.
   - Missing planning decision block rejects and does not persist a plan.
   - Planner quality retry uses `sessionReusePolicy: "never"`.
   - Clean first-run still uses `resume_if_available`.
   - Two different parent tasks in the same project create separate planner split proposals instead of cross-reusing.

8. Add coordinator/queue tests.
   - Full `pollAndProcess()` planning stage where `runPlanner` blocks with `split_required:` remains `blocked_external`, does not become `plan_ready`, and does not call plan checker or implementer.
   - Parent implementer does not start because the split-required parent is non-runnable.

9. Add result artifact after implementation.
   - Record positive and negative split tests.
   - Record exact verification commands and independent gate verdicts.

## Acceptance Criteria

- Split decision is machine-readable through `aif-planning-decision`.
- `split_required` does not save a runnable parent checklist plan.
- `split_required` does not transition the parent to `plan_ready`.
- Pending split proposal is created or reused.
- Parent implementer cannot start from the split-required parent state.
- Activity log includes the split proposal id.
- Missing/invalid decision blocks fail closed before plan persistence.
- Stale parent plan DB text and canonical plan file are cleared on `split_required`.
- `result.md` records positive and negative split tests.

## Verification Plan

- `npm.cmd test --workspace=@aif/shared -- --run src/__tests__/planningDecisionContract.test.ts src/__tests__/planQuality.test.ts`
- `npm.cmd test --workspace=@aif/agent -- --run src/__tests__/planner.test.ts src/__tests__/coordinator.test.ts`
- `npm.cmd run lint --workspace=@aif/shared`
- `npm.cmd run lint --workspace=@aif/agent`
- Independent `PLAN PASS` before implementation.
- Independent `TEST PASS` and `REVIEW PASS` after implementation.

## Reusable Patterns

- Make runtime-critical model decisions machine-readable and parse them before accepting free-form text.
- Route terminal planning decisions before plan persistence so downstream stages cannot misinterpret them as runnable plans.
