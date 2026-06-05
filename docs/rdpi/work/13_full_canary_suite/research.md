# Research - 13_full_canary_suite

## Task framing and lane

- Task input: `C:\Users\apron\Desktop\aif_stabilization_tz_pack\13_full_canary_suite.md`.
- Task id: `13_full_canary_suite`.
- Lane: `work`.
- Current repo root: `C:\Users\apron\source\aif-handoff`.
- Current commit before planning: `d783d55388483232b478dde78c7780072454d7b4`.
- Priority: P0/P1 verification.
- Goal: run a full canary suite after the P0/P1 stabilization fixes and prove workflow behavior, not only isolated unit correctness.
- This is a validation/audit-style RDPI task. Live evidence, logs, runtime checks, scheduler reads, endpoints, and tests are deferred until after an independent `PLAN PASS`.

## Accepted planning sources or local facts

- `AGENTS.md` requires RDPI for non-trivial work, local repo facts before memory, and independent `PLAN PASS`, `TEST PASS`, and `REVIEW PASS` gates.
- `.agents/skills/rdpi/SKILL.md` requires `python "$env:USERPROFILE\.codex\tools\codex-ensure-rdpi.py"` before RDPI artifact work. Preflight returned `STATUS: ready`.
- `package.json` defines the repo as an npm workspace monorepo. Core commands are:
  - `npm.cmd test`
  - `npm.cmd run build`
  - `npm.cmd run lint`
- Current worktree already has unrelated unstaged docs/memory edits under `docs/kb`, `docs/memory`, and `docs/rdpi/work/04_aif_result_contract_and_output/result.md`. They are not part of this task and must not be reverted.
- Prior numbered stabilization RDPI tasks exist under `docs/rdpi/work`, including:
  - `01_hard_tool_loop_guard`
  - `03_invalid_manifest_fallback_fail_closed`
  - `03b_coordinator_invalid_manifest_rework_integration`
  - `05_allowed_write_paths_tool_policy`
  - `06_planner_split_required_contract`
  - `07_same_failure_fingerprint_fail_closed`
  - `08_runtime_recovery_delta_guard`
  - `12_operator_closeout_idempotency_and_trust_rollup`
- Prior results indicate focused coverage already exists for most canaries:
  - Tool-loop containment: `packages/runtime/src/__tests__/qwenLocalAgent.test.ts`.
  - Checklist incomplete: `packages/agent/src/__tests__/coordinator.test.ts`, `packages/agent/src/__tests__/implementer.test.ts`, `packages/shared/src/__tests__/taskCompletionEvidence.test.ts`.
  - Invalid manifest fallback: `packages/agent/src/__tests__/implementer.test.ts`, `packages/agent/src/__tests__/coordinator.test.ts`, `packages/shared/src/__tests__/implementationManifest.test.ts`, `packages/shared/src/__tests__/taskCompletionEvidence.test.ts`.
  - Allowed write paths: `packages/runtime/src/__tests__/qwenLocalAgent.test.ts`.
  - Planner split: `packages/agent/src/__tests__/planner.test.ts`, `packages/agent/src/__tests__/coordinator.test.ts`, `packages/shared/src/__tests__/planningDecisionContract.test.ts`, `packages/shared/src/__tests__/planQuality.test.ts`, `packages/api/src/__tests__/tasks.test.ts`.
  - Same failure: `packages/agent/src/__tests__/coordinator.test.ts`, `packages/agent/src/__tests__/autoReviewHandler.test.ts`, `packages/api/src/__tests__/tasks.test.ts`.
  - Runtime recovery delta: `packages/agent/src/__tests__/coordinator.test.ts`, `packages/agent/src/__tests__/implementer.test.ts`.
  - Operator verified closeout: `packages/api/src/__tests__/tasks.test.ts`, `packages/data/src/__tests__/index.test.ts`.
  - Audit no-findings and fabricated evidence: `packages/shared/src/__tests__/taskCompletionEvidence.test.ts`, `packages/shared/src/__tests__/systemTzGoldenRegressionCorpus.test.ts`, `packages/agent/src/__tests__/coordinator.test.ts`, `packages/agent/src/__tests__/implementer.test.ts`.
- Explorer gate returned a static-only mapping of all 10 canaries to code/test anchors and identified canary 7 as the highest-risk evidence gap because it needs same artifact SHA plus same validator fingerprint behavior.

## Same-project memory

- Shared-memory recall was not queried before `PLAN PASS` because the RDPI boundary explicitly forbids shared-memory recall during planning unless the user waives that boundary.
- Local `docs/memory/**` files were only observed as repo files during static path discovery, not treated as live shared-memory authority.

## Cross-project reusable patterns

- None used before `PLAN PASS`.
- The task is repo-specific and local repo facts plus prior local RDPI artifacts are sufficient for planning.

## Rejected or stale memory candidates

- Explorer suggested `TASK_ID=work-20260605-full-canary-suite`. Rejected for this run because the user supplied `13_full_canary_suite.md`, and the surrounding TZ pack uses numbered task ids through `12_operator_closeout_idempotency_and_trust_rollup`.
- Historical canary task IDs found in prior docs are not accepted as current-run PASS evidence. They can guide command selection only. Current-run PASS requires commands and readback collected after `PLAN PASS`.
