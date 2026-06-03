# Research

## Task framing and lane

- Task: implement TZ 06, "Planner `split_required` as machine-readable state".
- Lane: `docs/rdpi/work/06_planner_split_required_contract/`.
- Priority from TZ: P1.
- Goal: planner output must expose a strict `aif-planning-decision` contract so `split_required` cannot be persisted as a runnable parent plan or advance the parent to `plan_ready`.

## Accepted planning sources

- Task spec: `C:\Users\apron\Desktop\aif_stabilization_tz_pack\06_planner_split_required_contract.md`.
- Repo guidance: `AGENTS.md`.
- Existing planner flow: `packages/agent/src/subagents/planner.ts`.
- Existing data split proposal model: `packages/data/src/index.ts`, `packages/shared/src/schema.ts`, `packages/shared/src/types.ts`.
- Existing plan quality split guard: `packages/shared/src/planQuality.ts`.
- Existing tests: `packages/agent/src/__tests__/planner.test.ts`, `packages/shared/src/__tests__/planQuality.test.ts`, `packages/api/src/__tests__/tasks.test.ts`, `packages/api/src/__tests__/projects.test.ts`.
- No runtime-visible evidence, service probing, scheduler reads, live endpoint checks, or shared-memory recall were used before this plan gate.

## Local repo facts

- `packages/shared/src/planningDecisionContract.ts` does not exist yet.
- `packages/shared/src/planQuality.ts` already has `task_size_split_required` and deterministic broad-task detection for plan quality, but it validates plan text after a plan exists rather than providing a planner decision state.
- `packages/agent/src/subagents/planner.ts` currently persists planner output with `persistTaskPlanForTask(...)` after normalizing and quality-checking plan text.
- `packages/agent/src/subagents/planner.ts` currently sets `sessionReusePolicy: "resume_if_available"` for fix, subagent, and skill planner runs, including quality-feedback/replan cases.
- `packages/agent/src/coordinator.ts` currently lets only requirements-analyst, researcher, designer, and QA runners update task status before generic success handoff. A planner-set `blocked_external` would otherwise be overwritten by the planner stage success transition to `plan_ready`.
- `packages/data/src/index.ts` already has `createOrReusePendingTaskSplitProposal(...)`, backed by `task_split_proposals`, but the shared `TaskSplitProposalSourceKind` currently allows `roadmap_import`, `roadmap_generation`, and `implementation_recovery` only.
- `createOrReusePendingTaskSplitProposal(...)` reuses/conflicts by `projectId + sourceKind + roadmapAlias + taskIntent + pending`, not by `parentTaskId`; planner-origin proposals need parent-specific identity inputs to avoid cross-task reuse.
- `task_split_proposals` can store parent-linked pending split proposals with `decision: "split_required"` and proposed children JSON.
- Existing task event guards already block manual implementation when a persisted plan fails `task_size_split_required`, but they are downstream fail-closed protection, not planner decision routing.

## Scope boundaries

- In scope:
  - shared parser/validator for `aif-planning-decision`;
  - planner prompt/session-reuse updates;
  - planner handling for `split_required`;
  - coordinator preservation of planner terminal split state;
  - data/source-kind extension if required for planner-origin split proposals;
  - focused shared and agent tests;
  - RDPI result artifact.
- Out of scope:
  - UI redesign for split proposals;
  - roadmap import/generation behavior beyond type compatibility;
  - changing the public task status enum;
  - creating or approving child tasks in this run.

## Same-project memory

- Same-project memory could be useful later for prior planner split decisions, but repo docs and source are sufficient for this task.
- No shared-memory lookup was performed before `PLAN PASS`.

## Cross-project reusable patterns

- Reuse the existing pattern from TZ 05: make machine-readable terminal decisions explicit, propagate them through the owner boundary, and prove downstream non-execution with run-level tests.
- No cross-project memory lookup was performed before `PLAN PASS`.

## Plan-review findings incorporated

- `PLAN FAIL` finding: coordinator would overwrite planner-set `blocked_external` with `plan_ready`; revised plan adds coordinator preservation and a coordinator test.
- `PLAN FAIL` finding: decision contract must be mandatory, not optional; revised plan requires exactly one valid `aif-planning-decision` for model planner output.
- `PLAN FAIL` finding: stale parent plan cleanup must clear DB plan and canonical plan file; revised plan specifies `persistTaskPlanForTask({ planText: null, ... })`.
- `PLAN FAIL` finding: split proposal identity must be parent-specific; revised plan specifies parent-derived `roadmapAlias`, `sourceRef`, and `sourceFingerprint`.

## Open questions

- None before implementation. The revised implementation will make the decision fence mandatory for model planner outputs while preserving deterministic planner fallback paths that do not invoke the model.

## Hypotheses

- A safe implementation must reject missing or invalid model planner decision blocks before plan persistence/status advancement.
- Extending `TaskSplitProposalSourceKind` with `planner_decision` is enough to reuse the existing proposal persistence without a new table.
- Blocking parent tasks as `blocked_external` with a `split_required:` reason is the least invasive representation of "pending proposal / blocked state".
- Parent-specific proposal identity can be achieved with `roadmapAlias = planner-split:${taskId}`, `sourceRef = task:${taskId}:planner_decision`, and a source fingerprint derived from task id/title/description/decision children.
