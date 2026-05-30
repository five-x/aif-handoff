# Result: Stage-Aware Runtime Routing And Qwen Caps

Task: `work-20260530-stage-aware-runtime-routing-and-qwen-caps`
Date: 2026-05-30

## Outcome

Implemented stage-aware runtime capability policy and Qwen/local safety caps across runtime selection, agent execution, coordinator pre-dispatch checks, stage error handling, and Qwen adapter request budgeting.

Key behavior now enforced:

- Qwen/local profiles are denied for `implementer` by default.
- Qwen/local implementation can be enabled only through explicit profile configuration or implementation canary evidence.
- Qwen/local remains eligible by default for non-implementation stages including planning, review, audit, synthesis, and chat.
- Stage caps are resolved from profile options and applied to execution intent, retry behavior, adapter options, and Qwen request budgeting.
- Configured implementation candidates that are not implementation-capable block before implementer dispatch with operator-readable messaging.
- Runtime stage capability and no-capable-profile errors are classified as sanitized permission failures.

## Changed Files

- `packages/shared/src/runtimeStagePolicy.ts`
- `packages/shared/src/__tests__/runtimeStagePolicy.test.ts`
- `packages/shared/src/index.ts`
- `packages/data/src/index.ts`
- `packages/data/src/__tests__/runtimeProfileResolution.test.ts`
- `packages/agent/src/subagentQuery.ts`
- `packages/agent/src/stageErrorHandler.ts`
- `packages/agent/src/coordinator.ts`
- `packages/agent/src/__tests__/subagentQuery.test.ts`
- `packages/agent/src/__tests__/stageErrorHandler.test.ts`
- `packages/agent/src/__tests__/coordinator.test.ts`
- `packages/runtime/src/adapters/qwenLocalAgent/api.ts`
- `packages/runtime/src/__tests__/qwenLocalAgent.test.ts`

## Verification

Passed:

- `npm.cmd test --workspace=@aif/shared -- --run src/__tests__/runtimeStagePolicy.test.ts`
- `npm.cmd test --workspace=@aif/data -- --run src/__tests__/runtimeProfileResolution.test.ts`
- `npm.cmd test --workspace=@aif/agent -- --run src/__tests__/subagentQuery.test.ts`
- `npm.cmd test --workspace=@aif/agent -- --run src/__tests__/stageErrorHandler.test.ts`
- `npm.cmd test --workspace=@aif/agent -- --run src/__tests__/coordinator.test.ts`
- `npm.cmd test --workspace=@aif/runtime -- --run src/__tests__/qwenLocalAgent.test.ts`
- `npx.cmd prettier --check <touched task files>`
- `git diff --check -- <touched task files>`
- `npm.cmd run lint`
- `npm.cmd test`
- `npm.cmd run build`

Known unrelated verification issue:

- `npm.cmd run format:check` still fails because repo-wide Prettier reports unrelated dirty memory docs:
  - `docs/memory/entities/aif-handoff/capsule.md`
  - `docs/memory/projects/aif-handoff/capsule.md`
  - `docs/memory/tasks/work/work-20260530-implementation-timeout-recovery-split-pack-delta.md`

## Gates

- PLAN: PASS by independent reviewer.
- TEST: PASS by independent tester after documenting the unrelated repo-wide format warnings.
- REVIEW: Initial FAIL found an unintended Qwen chat eligibility regression. Fixed by allowing `chat` by default and adding shared/data regression tests. Final independent review returned PASS.

## Memory

- `codex-memsync.py --mode auto` completed successfully.
- Report: `docs/memory/reports/work-20260530-stage-aware-runtime-routing-and-qwen-caps-memsync-report.md`
- Status: `success`; reason: `ingested 8 shared-memory items`.
