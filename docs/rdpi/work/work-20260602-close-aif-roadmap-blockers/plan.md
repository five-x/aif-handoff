# Plan

## Implementation plan

1. Harden pre-implementation write safety.
   - Add stage cap fields for read-only sandbox/approval defaults.
   - Apply them in `packages/agent/src/subagentQuery.ts` when building runtime adapter options.
   - Deny write-capable `run_shell` invocations for Qwen read-only workflows.
   - Add regression tests in runtime/agent stage-policy coverage.

2. Harden `aif-plan-manifest` repair.
   - Update `packages/shared/src/planQuality.ts` so malformed single manifest blocks can be replaced by deterministic normalized manifests when possible.
   - Normalize disk plans in `accept_existing_plan` before plan-quality evaluation and persistence.
   - Add plan-quality/API tests for malformed or JSON-fenced manifests and ensure broad plans still block.

3. Harden QA fallback.
   - Keep fallback pass conditions strict but make synthesized artifacts include parser error/source metadata and command evidence summaries.
   - Add QA tests for missing fenced `aif-qa-artifact` with passed mandatory implementation evidence and blocked/missing evidence cases.

4. Harden container closeout.
   - Add/export a helper in `packages/data/src/index.ts` to check whether a container parent satisfies its direct-child closeout policy.
   - Use it in `packages/api/src/services/taskEvents.ts` to bypass fresh QA/acceptance artifact requirements only for satisfied container parents.
   - Add API/data tests for roadmap/container parent approval and executable task non-bypass.

5. Harden requirements actor intake.
   - Extend `packages/agent/src/subagents/requirementsAnalyst.ts` actor heuristics for internal/test-only/operator cards.
   - Add regression tests that no primary-actor question is raised when actor/scope/acceptance are already declared.

6. Clarify deploy/readiness handoff.
   - Extend acceptance-pack readiness metadata/markdown in `packages/data/src/index.ts` with separate deploy readiness signals.
   - Add tests that the pack distinguishes built artifacts, preview smoke, public domain routing, and git remote/push availability.

## Acceptance criteria

- Planning and other pre-implementation stages cannot use write-capable shell operations or Codex workspace-write defaults.
- Full-mode planner and accept-existing-plan flows normalize/repair the `aif-plan-manifest` contract when deterministic repair is possible, while broad plans still fail closed.
- QA-stage missing `aif-qa-artifact` output is deterministically synthesized only from fresh passed mandatory evidence.
- Satisfied roadmap/container parents can approve from `done` to `verified` without irrelevant parent QA/acceptance artifacts.
- Internal/test-only/operator cards do not receive irrelevant primary-actor questions when scope and acceptance are declared.
- Acceptance packs separate build, preview smoke, public routing, and git remote/push readiness signals.
- Regression tests cover the `zai-mi` failure pattern.

## Verification plan

- Targeted tests while implementing:
  - `npm.cmd test --workspace @aif/shared -- planQuality runtimeStagePolicy`
  - `npm.cmd test --workspace @aif/runtime -- qwenLocalAgent`
  - `npm.cmd test --workspace @aif/agent -- planner planChecker qaStage requirementsAnalyst subagentQuery`
  - `npm.cmd test --workspace @aif/api -- tasks`
  - `npm.cmd test --workspace @aif/data -- index`
- Final repo checks:
  - `npm.cmd run format:check`
  - `npm.cmd run lint`
  - `npm.cmd test`
  - `npm.cmd run build`
- Required gates:
  - Independent `PLAN PASS` before implementation.
  - Independent `TEST PASS` after implementation.
  - Independent `REVIEW PASS` after tests.

## Reusable patterns

- Deterministic repair may replace malformed structured output only when local task context can produce a valid, scoped contract.
- Parent container closeout gates should consume child trust state rather than inventing parent implementation evidence.
