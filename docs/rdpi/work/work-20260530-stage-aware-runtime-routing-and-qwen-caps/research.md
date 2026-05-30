# Research

## Task

- Task ID: `work-20260530-stage-aware-runtime-routing-and-qwen-caps`
- Lane: `work`
- Intake: `docs/intake/work/work-20260530-stage-aware-runtime-routing-and-qwen-caps.md`
- Scope: add deterministic stage-aware runtime eligibility and caps so local Qwen cannot run implementation by default.

## Accepted Sources

- Intake card: `docs/intake/work/work-20260530-stage-aware-runtime-routing-and-qwen-caps.md`.
- RDPI predecessor results:
  - `docs/rdpi/work/work-20260530-fail-closed-implementation-runtime-exhaustion/result.md`
  - `docs/rdpi/work/work-20260530-task-size-gate-before-implementation/result.md`
  - `docs/rdpi/work/work-20260530-implementation-timeout-recovery-split-pack/result.md`
- Local code:
  - `packages/shared/src/constants.ts`
  - `packages/shared/src/types.ts`
  - `packages/data/src/index.ts`
  - `packages/agent/src/coordinator.ts`
  - `packages/agent/src/subagentQuery.ts`
  - `packages/agent/src/stageErrorHandler.ts`
  - `packages/runtime/src/adapters/qwenLocalAgent/api.ts`
  - `packages/runtime/src/adapters/qwenLocalAgent/index.ts`
- Local tests:
  - `packages/data/src/__tests__/runtimeProfileResolution.test.ts`
  - `packages/agent/src/__tests__/subagentQuery.test.ts`
  - `packages/agent/src/__tests__/stageErrorHandler.test.ts`
  - `packages/runtime/src/__tests__/qwenLocalAgent.test.ts`
- Shared memory after local fact gathering:
  - Qwen local runtime was implemented for function-style llama.cpp tools.
  - A live `botIntevra` profile previously used `qwen-local-agent` for plan/review defaults.
  - Memory had no newer fact for implementer default denial or stage-aware routing, so local sources govern.

## Local Facts

- `packages/shared/src/constants.ts` already defines canonical runtime stages and stage-to-profile-mode mapping:
  - plan-family stages route to profile mode `plan`
  - implementer routes to profile mode `task`
  - reviewer/security/qa route to profile mode `review`
- `packages/data/src/index.ts` resolves effective runtime profiles by task override, project default, then system default. It currently checks missing/disabled profiles but not stage capability.
- `packages/agent/src/subagentQuery.ts` converts workflow kind to runtime stage, resolves the effective runtime profile, checks adapter hard capabilities such as `supportsRepositoryTools`, builds runtime execution intent, and passes `maxTurns`, run timeout, budget, and repository-inspection budgets to adapters.
- `packages/agent/src/coordinator.ts` already resolves runtime profile before claiming a task for proactive runtime limit gating. That is the right place to fail closed before implementer runtime if configured candidates exist but none are implementation-capable.
- `packages/runtime/src/adapters/qwenLocalAgent/index.ts` advertises `supportsRepositoryTools: true`, which is necessary but too broad for implementation safety.
- `packages/runtime/src/adapters/qwenLocalAgent/api.ts` has local endpoint token budgets, max tool turn handling, run timeout handling, and structured max-tool-turn exhaustion metadata.
- The predecessor fail-closed task already classifies implementer timeout, runtime budget exhaustion, and Qwen max-tool-turn exhaustion as `implementation_runtime_exhausted_requires_split`.

## Constraints

- Do not remove Qwen plan/review/audit support by default.
- Do not tune or install remote/local models in this task.
- Do not relax task-size gates.
- Do not rely on raw provider error text in blocked reasons.
- Existing no-profile environment fallback behavior is compatibility-sensitive; stage fail-closed should target configured profiles that are present but not capable.

## Hypotheses

- H1: A shared stage-policy helper can make data routing, agent execution, and tests use one deterministic capability matrix without a schema migration.
- H2: Runtime profile `options` can carry explicit stage capability/canary flags and per-stage caps without changing the database schema.
- H3: Filtering disallowed profiles in `resolveEffectiveRuntimeProfile` will let valid fallback profiles run while making Qwen implementer defaults disappear from implementation routing.
- H4: Subagent-level enforcement is still required because coordinator fallbacks and test/direct call paths can bypass data candidate filtering.
- H5: Qwen endpoint context caps should be enforced inside the adapter request-budget calculation so a stage cap cannot be ignored by direct adapter calls.

## Verification Plan

- Shared/data coverage:
  - Qwen local profile is denied for `implementer` by default.
  - Explicit Qwen implementation capability or canary flag allows `implementer`.
  - Stage caps parse deterministically from profile options.
  - Effective runtime resolution skips disallowed implementer candidates and falls back to capable profiles.
- Agent coverage:
  - Direct subagent execution rejects a Qwen implementer profile without invoking the adapter.
  - Explicitly enabled Qwen implementation routes and applies stage caps to execution intent and adapter options.
  - Coordinator blocks configured-but-incapable implementer routing before the implementer runner.
  - Stage error handling surfaces sanitized operator-readable runtime-stage blockers.
- Runtime coverage:
  - Qwen request building applies configured context/window caps and fails closed before fetch when exceeded.
- Commands:
  - `npm.cmd test --workspace=@aif/shared -- --run src/__tests__/runtimeStagePolicy.test.ts`
  - `npm.cmd test --workspace=@aif/data -- --run src/__tests__/runtimeProfileResolution.test.ts`
  - `npm.cmd test --workspace=@aif/agent -- --run src/__tests__/subagentQuery.test.ts src/__tests__/stageErrorHandler.test.ts src/__tests__/coordinator.test.ts`
  - `npm.cmd test --workspace=@aif/runtime -- --run src/__tests__/qwenLocalAgent.test.ts`
  - `npm.cmd run format:check`
  - `npm.cmd run lint`
  - `npm.cmd test`
  - `npm.cmd run build`
