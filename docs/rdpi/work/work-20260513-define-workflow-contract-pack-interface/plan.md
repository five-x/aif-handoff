# Plan - Define Workflow Contract Pack Interface

## Plan Review State

First independent review returned `PLAN FAIL` because the plan mixed this interface slice with a runtime audit convergence experiment and broader task hierarchy redesign.

Revised state: pending independent `PLAN PASS` or `PLAN FAIL` rerun.

The plan review gate must directly answer:

Does this preserve AIF Handoff as an autonomous task handoff platform rather than turning it into an audit product?

## Implementation Slice

Smallest useful slice: introduce a code-level workflow pack registry and route existing task-intent validation plus the highest-risk audit generated-task validation through it, while adding a feature-development canary that proves feature tasks are not forced through audit semantics.

This slice improves audit reliability by preserving all current audit card constraints behind an audit pack. It avoids database migrations and avoids rewriting artifact lifecycle, report validation, or completion evidence in the first step.

## Explicitly Out Of Scope For This Slice

- No runtime audit convergence experiment.
- No changes to `maxReviewIterations`.
- No live workflow observation, scheduler probing, endpoint checks, log inspection, or downstream runtime/config reads.
- No planner/reviewer `replan_required` or `decompose_required` behavior.
- No parent/child task hierarchy, aggregation, or depth-limit implementation.
- No database schema migration.
- No finance or analytics pack implementation.

Any of those may become separate intake cards after this planning task closes, but they are not authorized by this plan.

## Steps

1. Add a shared workflow pack module.
   - New file candidate: `packages/shared/src/workflowPacks.ts`.
   - Define `WorkflowPack` with `id`, `label`, `taskContract`, and `validateGeneratedTask`.
   - Keep optional `roadmap`, `artifacts`, `completion`, `review`, and `memory` fields as typed extension points, but do not wire all of them in the first slice.
   - Export `WORKFLOW_PACKS`, `getWorkflowPack(intent)`, and `validateGeneratedWorkflowTask(...)`.

2. Move task-intent validation routing behind the registry.
   - Update `packages/shared/src/taskIntent.ts` so `validateGeneratedTaskIntent` delegates to `getWorkflowPack(input.taskIntent).validateGeneratedTask(...)`.
   - Preserve exact issue messages and behavior for existing intents.
   - Keep `TASK_INTENT_CONTRACTS` as the source for task defaults in this slice.

3. Define the audit pack as a strict adapter over existing validators.
   - Audit pack `validateGeneratedTask` calls `validateGeneratedAuditCard`.
   - Do not change audit issue codes, marker requirements, risk hypothesis checks, report-only allowed changes, or synthesis scope behavior.
   - Add comments or docs only where needed to make clear that the audit pack owns these semantics.

4. Define a feature pack canary without adding feature-specific runtime infrastructure.
   - Feature pack validation requires `Acceptance criteria:` and `Verification:`.
   - It must not require audit markers such as `Report artifact:`, `Risk hypotheses:`, audit manifest, diagnostic-only, synthesis outcome, or report-only allowed changes.
   - It should preserve the existing feature task contract in `TASK_INTENT_CONTRACTS`.

5. Add focused shared tests.
   - `packages/shared/src/__tests__/taskIntent.test.ts` or a new `workflowPacks.test.ts`.
   - Assert audit generated cards still fail on missing diagnostic markers, broad source scope, missing risk hypotheses, implementation-shaped audit content, and non-report allowed changes.
   - Assert valid audit source/synthesis examples still pass.
   - Assert a valid feature task with acceptance criteria, verification, dependencies, scope, evidence requirements, and source/test/docs allowed changes passes.
   - Assert the same feature task is not rejected for missing audit report artifact, audit risk hypotheses, diagnostic-only, manifest, or synthesis outcome.
   - Assert an explicit `taskIntent: "feature"` roadmap extraction path still rejects tasks for other intents but does not apply audit validation.

6. Add a short local architecture note.
   - Candidate: `docs/kb/workflow-contract-pack-interface.md`.
   - Capture core primitives, pack-owned semantics, audit migration shape, feature canary, and deferred analytics/finance boundaries.
   - Keep it implementation-neutral and reference the current RDPI task.

7. Run focused verification.
   - `npm.cmd test --workspace=@aif/shared -- --run src/__tests__/taskIntent.test.ts`
   - If a new test file is added: include it in the same shared test command.
   - `npm.cmd run build --workspace=@aif/shared`
   - `npm.cmd run lint --workspace=@aif/shared`
   - `git diff --check`

8. After implementation, complete RDPI close-out.
   - Write `result.md` with implementation summary, verification, and gate outcomes.
   - Run independent `TEST PASS`.
   - Run independent `REVIEW PASS`.
   - Run `python "$env:USERPROFILE\.codex\tools\codex-memsync.py" --repo . --mode auto --lane work --task-id work-20260513-define-workflow-contract-pack-interface --project aif-handoff --entity aif-handoff`.
   - Update only the matching `docs/intake/work_status.json` entry after local memory review succeeds.

## Acceptance Mapping

- `research.md` maps planner, implementer, reviewer, roadmap, memory, and audit evidence flows.
- `design.md` separates core handoff primitives from workflow pack semantics.
- The implementation slice is small enough to improve audit reliability by isolating audit semantics without rewriting validators.
- The feature-development canary proves source/test/docs implementation workflows are first-class and are not report-only audit tasks.
- No finance or analytics implementation is included.
- No database schema is added in this first slice.
- No follow-up implementation task is executed inside this planning task.

## Follow-Up Cards To Queue Separately

These should be separate intake cards after this planning task, not part of the planning close-out:

- Implement workflow pack registry and feature canary.
- Move audit roadmap generation/import behavior behind audit pack optional hooks.
- Generalize audit evidence ledger naming to core evidence unit aliases while preserving audit table compatibility.
- Design generic artifact/claim persistence after audit plus feature canary both pass.
- Add UI/API surfaces for generic artifact, claim, and evidence timelines.

## Gate Requirements

- Independent `PLAN PASS` is required before any implementation task is queued or run.
- For the future implementation card, independent `TEST PASS` and `REVIEW PASS` are required before close-out.
- If plan review returns `PLAN FAIL`, revise `design.md` and `plan.md`, then rerun the gate.

## Current Task Close-Out Plan

This task is planning-only. After `PLAN PASS`, close it by:

1. Writing `result.md` that records the planning outcome and explicit no-implementation boundary.
2. Running memsync in auto mode and treating local review failure as blocking.
3. Marking only `work-20260513-define-workflow-contract-pack-interface` done in `docs/intake/work_status.json`.
