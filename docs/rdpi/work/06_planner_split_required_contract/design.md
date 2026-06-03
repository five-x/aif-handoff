# Design

## Chosen design

Add a shared `aif-planning-decision` parser/validator and route planner `split_required` decisions before normal plan persistence or coordinator success handoff.

The shared contract will require exactly one fenced `aif-planning-decision` JSON block for model planner outputs. It will validate:

- `decision` is one of `ready_plan`, `split_required`, `needs_input`, or `blocked`;
- `taskId` is present and matches the task being planned;
- `reason` is non-empty;
- `split_required` includes at least one valid child proposal;
- child proposals have title, allowed task intent, concrete scope/file boundaries, acceptance criteria, verification commands, and forbidden changes.

For `split_required`, planner will:

- call `persistTaskPlanForTask({ planText: null, ... })` to clear stale DB plan text and the canonical plan file;
- create or reuse a pending split proposal through `createOrReusePendingTaskSplitProposal(...)`;
- mark the parent task `blocked_external` from `planning` with a `split_required:` blocked reason containing the proposal id;
- write an activity log entry with the proposal id;
- return without starting implementer.

Planner-origin split proposal identity will be parent-specific:

- `sourceKind`: `planner_decision`;
- `roadmapAlias`: `planner-split:${taskId}`;
- `sourceRef`: `task:${taskId}:planner_decision`;
- `sourceFingerprint`: stable hash of task id, title, description, planner mode, task intent, decision reason, and proposed children.

If `createOrReusePendingTaskSplitProposal(...)` returns `conflict`, planner will block the parent with a `split_required_conflict:` reason instead of saving a plan or advancing to `plan_ready`.

Coordinator will explicitly preserve planner terminal split outcomes. After `runPlanner(...)`, if the latest task is `blocked_external` with a `split_required:` or `split_required_conflict:` reason, coordinator will broadcast the move and return without applying the generic planner success transition to `plan_ready`.

For session reuse:

- planner runs with plan-quality feedback, blocked reason feedback, retries, or replans use `sessionReusePolicy: "never"`;
- clean first-run planning can keep `resume_if_available`.

## Contract shape

The planner prompt will request a final decision block:

```aif-planning-decision
{
  "decision": "ready_plan | split_required | needs_input | blocked",
  "taskId": "<taskId>",
  "reason": "...",
  "proposedChildren": [
    {
      "title": "...",
      "taskIntent": "feature | fix | docs | tests | audit",
      "scope": ["path/to/file.ts"],
      "acceptanceCriteria": ["..."],
      "verificationCommands": ["..."],
      "forbiddenChanges": ["..."]
    }
  ]
}
```

Internally, `scope` will map to the existing `TaskSplitProposedChild.fileBoundaries` field. Child `description`, `phase`, `phaseName`, and `sequence` can be derived in the planner handler from the decision data.

Deterministic non-model planner fallbacks may keep their existing direct plan generation path because they are not model planner outputs and already produce validated plans from local task metadata. Model planner outputs without the decision block are invalid.

## Pre-PLAN boundary

- Allowed before `PLAN PASS`: read task spec, local source, local tests, and local docs; create RDPI research/design/plan artifacts.
- Not allowed before `PLAN PASS`: implementation edits, test execution, live service checks, runtime/session probing, shared-memory recall, or downstream worker report inspection.

## Decision candidates

- Parser/validator lives in `packages/shared/src/planningDecisionContract.ts` so agent and tests share a single contract.
- Proposal persistence reuses `task_split_proposals` and extends `TaskSplitProposalSourceKind` with `planner_decision`.
- Parent non-runnability is represented with existing task state `blocked_external` and `blockedReason` prefix `split_required:`.
- Coordinator preservation is part of the implementation boundary because planner-local state changes are otherwise overwritten by the generic success path.
