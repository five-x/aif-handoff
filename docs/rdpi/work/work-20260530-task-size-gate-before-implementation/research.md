# Research

## Task framing and lane

- Task ID: `work-20260530-task-size-gate-before-implementation`.
- Lane: `work`.
- RDPI Needed: yes.
- Immutable intake card: `docs/intake/work/work-20260530-task-size-gate-before-implementation.md`.
- Request: add a deterministic pre-implementation task-size gate that rejects broad, vague, or multi-area implementation cards before implementer runtime starts and tells the operator how to split them.

## Accepted planning sources or local facts

- `codex-ensure-rdpi.py` returned `STATUS: ready`.
- `codex-flow-audit.py --repo .` returned `STATUS: clean`.
- `AGENTS.md` requires RDPI, independent gates, local repo facts before memory, and no implementation before `PLAN PASS`.
- The worktree was dirty before this task. Existing unrelated changes include intake, memory, RDPI, agent, data, runtime, and API files. This task must avoid reverting or normalizing unrelated changes.
- `packages/shared/src/planQuality.ts` owns deterministic plan validation. It already validates checklist structure, generic/placeholder plans, diagnostic boundaries, and the `aif-plan-manifest` contract.
- `packages/shared/src/planQuality.ts` already requires full-mode plan manifests with `scope`, `allowedChanges`, `forbiddenChanges`, `expectedArtifacts`, `acceptanceCriteria`, and `verificationCommands`, but it does not yet reject a broad implementation plan solely because the manifest spans too many file groups/subsystems or uses vague scaffold language.
- `packages/api/src/services/taskEvents.ts` checks pre-implementation completion evidence when an operator manually posts `start_implementation`. That path must use the size gate so manual start cannot bypass plan-checker validation.
- `packages/agent/src/coordinator.ts` runs the plan-checker stage before implementer runtime and handles `TaskPlanQualityError` without entering implementer runtime.
- The auto-mode pre-implementer hook in `packages/agent/src/coordinator.ts` already calls the pre-implementation evidence guard before the status update to `implementing`; the task-size rule should reuse that hook instead of adding a second coordinator-only gate.
- `packages/shared/src/taskCompletionEvidence.ts` already treats a generic plan as a pre-implementation issue, but its generic check is narrow and does not cover broad manifest-backed scaffold cards.
- `packages/agent/src/subagents/planner.ts` and `packages/agent/src/subagents/planChecker.ts` prompt for `aif-plan-manifest` fields. Prompt text can be tightened, but deterministic validation must not rely on model self-assessment.
- Roadmap hierarchy/split plumbing already exists in `packages/data/src/index.ts`, `packages/api/src/services/roadmapGeneration.ts`, and API tests. The size gate should return a clear split-required failure instead of creating or running child implementation work automatically.
- `TaskSplitProposedChild` currently stores title, description, task intent, phase, sequence, and tags. It does not have explicit first-class fields for file boundaries, acceptance checks, or verification commands, so the minimum contract for roadmap-created children should be encoded in child descriptions/manifests and validated before implementation.
- Existing tests to extend include `packages/shared/src/__tests__/planQuality.test.ts`, `packages/shared/src/__tests__/taskCompletionEvidence.test.ts`, `packages/agent/src/__tests__/planChecker.test.ts`, and `packages/api/src/__tests__/tasks.test.ts`.
- Nearby existing coverage includes plan-checker local rejection tests, API `start_implementation` tests, and coordinator tests asserting plan-quality failure does not call `runImplementer`.

## Same-project memory

- Not consulted before `PLAN PASS`. The local RDPI rules prohibit shared-memory recall before plan review unless explicitly waived.

## Cross-project reusable patterns

- Not consulted before `PLAN PASS` for the same boundary. The implementation shape is local to this repository.

## Rejected or stale memory candidates

- Existing `docs/memory/**` files were already dirty before this task and are not planning sources for this run.

## Working hypothesis

- The safest implementation is to extend the existing plan-quality contract with a deterministic `task_size_split_required` issue and to call that same validation from the pre-implementation evidence guard.
- The gate should be based on observable plan-manifest fields and task/plan text:
  - concrete file boundaries from manifest `scope` and `expectedArtifacts`;
  - expected changed file groups from normalized manifest paths;
  - major subsystems from top-level repo/package areas;
  - verification surface from manifest `verificationCommands`;
  - broad/vague implementation language from task title, description, and plan.
- Rejection should not create or execute split children. It should fail closed with operator-readable split dimensions.
- The existing broad descriptive manifest test for “project architecture and core engine skeleton” is close to the target regression case and must be narrowed or converted to negative coverage.
