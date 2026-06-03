<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

---

memory_id: task::aif-handoff::work::06_planner_split_required_contract::delta
project_id: project::aif-handoff
repo_name: aif-handoff
lane: work
task_id: 06_planner_split_required_contract
source_path: docs/rdpi/work/06_planner_split_required_contract
stability: validated
sensitivity: local-only
kind: artifact
project: aif-handoff
entity: aif-handoff
scope: task
updated_at: 2026-06-03
supersedes:
expires_at:
tags:

- aif-handoff
- aif-handoff
- aif-handoff
- work
- task-delta
  source_refs:
- docs/rdpi/work/06_planner_split_required_contract/research.md
- docs/rdpi/work/06_planner_split_required_contract/design.md
- docs/rdpi/work/06_planner_split_required_contract/plan.md
- docs/rdpi/work/06_planner_split_required_contract/result.md
  created_at: 2026-06-03
  last_verified_at: 2026-06-03

---

# Summary

Curated delta for task 06_planner_split_required_contract.

# Why it matters

Keeps the reusable task outcome in one reviewable place before publication.

# When to reuse

Reuse this document when checking what was learned from this task.

# When not to reuse

Do not treat task-local implementation details as cross-project guidance unless they were promoted into decisions or patterns.

## Facts

- none

## Decisions

- Parser/validator lives in `packages/shared/src/planningDecisionContract.ts` so agent and tests share a single contract.
- Proposal persistence reuses `task_split_proposals` and extends `TaskSplitProposalSourceKind` with `planner_decision`.
- Parent non-runnability is represented with existing task state `blocked_external` and `blockedReason` prefix `split_required:`.
- Coordinator preservation is part of the implementation boundary because planner-local state changes are otherwise overwritten by the generic success path.
- `decision` is one of `ready_plan`, `split_required`, `needs_input`, or `blocked`;
- `taskId` is present and matches the task being planned;
- `reason` is non-empty;
- `split_required` includes at least one valid child proposal;
- child proposals have title, allowed task intent, concrete scope/file boundaries, acceptance criteria, verification commands, and forbidden changes.
- call `persistTaskPlanForTask({ planText: null, ... })` to clear stale DB plan text and the canonical plan file;
- create or reuse a pending split proposal through `createOrReusePendingTaskSplitProposal(...)`;
- mark the parent task `blocked_external` from `planning` with a `split_required:` blocked reason containing the proposal id;
- write an activity log entry with the proposal id;
- return without starting implementer.
- `sourceKind`: `planner_decision`;
- `roadmapAlias`: `planner-split:${taskId}`;
- `sourceRef`: `task:${taskId}:planner_decision`;
- `sourceFingerprint`: stable hash of task id, title, description, planner mode, task intent, decision reason, and proposed children.
- planner runs with plan-quality feedback, blocked reason feedback, retries, or replans use `sessionReusePolicy: "never"`;
- clean first-run planning can keep `resume_if_available`.

## Patterns

- Make runtime-critical model decisions machine-readable and parse them before accepting free-form text.
- Route terminal planning decisions before plan persistence so downstream stages cannot misinterpret them as runnable plans.
