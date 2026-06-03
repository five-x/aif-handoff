<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

---

memory_id: task::aif-handoff::work::06_planner_split_required_contract::entity-capsule
project_id: project::aif-handoff
repo_name: aif-handoff
lane: work
task_id: 06_planner_split_required_contract
source_path: docs/rdpi/work/06_planner_split_required_contract
stability: stable
sensitivity: local-only
kind: capsule
project: aif-handoff
entity: aif-handoff
scope: project
updated_at: 2026-06-03
supersedes:
expires_at:
tags:

- aif-handoff
- aif-handoff
- aif-handoff
- work
- capsule
  source_refs:
- docs/rdpi/work/06_planner_split_required_contract/research.md
- docs/rdpi/work/06_planner_split_required_contract/design.md
- docs/rdpi/work/06_planner_split_required_contract/plan.md
- docs/rdpi/work/06_planner_split_required_contract/result.md
  created_at: 2026-06-03
  last_verified_at: 2026-06-03

---

# Summary

Current capsule for entity aif-handoff, refreshed by task 06_planner_split_required_contract.

# Why it matters

Makes entity-level recall cheaper and more consistent.

# When to reuse

Reuse before editing the same component or domain.

# When not to reuse

Do not reuse if the entity boundary or ownership changed.

## Active decisions

- Parser/validator lives in `packages/shared/src/planningDecisionContract.ts` so agent and tests share a single contract.
- Proposal persistence reuses `task_split_proposals` and extends `TaskSplitProposalSourceKind` with `planner_decision`.
- Parent non-runnability is represented with existing task state `blocked_external` and `blockedReason` prefix `split_required:`.
- Coordinator preservation is part of the implementation boundary because planner-local state changes are otherwise overwritten by the generic success path.
- `decision` is one of `ready_plan`, `split_required`, `needs_input`, or `blocked`;
- `taskId` is present and matches the task being planned;
- `reason` is non-empty;
- `split_required` includes at least one valid child proposal;
