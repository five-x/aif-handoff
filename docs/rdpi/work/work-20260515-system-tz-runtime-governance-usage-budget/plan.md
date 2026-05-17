# Plan: System TZ Runtime Governance Usage Budget

## Implementation Steps

1. Add shared runtime stage constants and helpers.
   - Define canonical stage ids and compatibility mode mapping.
   - Export helpers from shared server/browser barrels.
   - Extend warmup targets to carry stage ids and include security, audit, and synthesis.

2. Extend data-layer runtime resolution.
   - Allow `getAppDefaultRuntimeProfileId` and `resolveEffectiveRuntimeProfile` to accept a canonical stage or existing compatibility mode.
   - Preserve existing task/plan/review/chat behavior.
   - Add focused tests for planner, plan checker, implementer, reviewer, security, chat, audit, and synthesis stage resolution.

3. Add runtime usage outcome persistence.
   - Add `outcome` and `error_category` columns to `usage_events`.
   - Update schema, migrations, DB ensure SQL, usage sink types, runtime registry wrapper, and data persistence.
   - Record zero-usage `missing_usage` and `failed` rows without changing aggregate totals.

4. Add budget gate helpers.
   - Implement task/stage budget evaluation using existing project budget fields and task-scoped usage events.
   - Support allow/warn/block/override outcomes.
   - Keep override source in `runtimeOptions.runtimeBudgetOverride.justification`.

5. Make runtime-limit auto-resume explicit.
   - Preserve the existing `blocked_external` + `retryAfter` release path.
   - Add runtime-limit-specific tests proving provider `resetAt` / `retryAfterSeconds` produce `retryAfter`, tasks are not processed early, due tasks are released, task runtime-limit snapshots are cleared, and normal stage processing resumes.
   - Keep random backoff only as a visible fallback when no structured provider hint exists.

6. Wire coordinator runtime governance.
   - Replace implicit stage-to-mode mapping with canonical runtime stages.
   - Apply budget gate before claim and before runtime-limit gate.
   - Apply runtime-limit fallback policy centrally: planner/plan-checker/reviewer/security may fall back with explicit activity logs; implementer/audit/synthesis block.
   - Persist existing task runtime-limit snapshots on block.

7. Wire subagent/API stage metadata where low-risk.
   - Pass canonical stages from planner, plan checker, implementer, reviewer/security subagent calls.
   - Keep API chat and one-shot runtime behavior compatible.

8. Update docs.
   - Refresh `docs/providers.md` and `docs/configuration.md` for canonical stages, usage outcomes, budget behavior, and warmup targets.
   - Document compatibility UI coverage: existing task/project/runtime-profile cost visibility is retained; stage budget warning/block state is visible via activity/blocked reason; monthly/task-wide/chat budget enforcement is deferred.

## Acceptance Checks

- Runtime stage resolution order remains task override -> project default -> app default -> environment fallback.
- Planner/plan-checker and reviewer/security blocked-runtime fallback is explicit in task activity logs.
- Implementer, audit, and synthesis do not silently switch runtime when the selected profile is blocked.
- Runtime-limit `resetAt` / `retryAfterSeconds` drives `retryAfter`; blocked tasks stay parked before the retry window and auto-resume after it.
- Every adapter invocation records a `usage_events` row with `success`, `missing_usage`, or `failed`.
- Budget warnings and blocks are visible through task activity/blocked reason.
- Existing per-task, per-project, and runtime-profile cost displays continue to work; stage budget state is warning/block/override only; monthly/task-wide/chat budget enforcement is documented as unsupported in this compatibility slice.
- Warmup targets are stage-aware and remain TTL/runtime/profile/model scoped.

## Verification Plan

- `npm.cmd run test --workspace=@aif/shared -- src/__tests__/db.test.ts`
- `npm.cmd run test --workspace=@aif/data -- src/__tests__/runtimeProfiles.test.ts`
- `npm.cmd run test --workspace=@aif/runtime -- src/__tests__/registry.test.ts`
- `npm.cmd run test --workspace=@aif/agent -- src/__tests__/coordinator.test.ts src/__tests__/subagentQuery.test.ts`
- Package builds for touched workspaces.
- `git diff --check -- <touched files>`

## Non-Goals

- No physically separate per-stage default columns in this run.
- No project monthly/task-wide/chat budget schema in this run.
- No dedicated chat budget enforcement UI in this run.
- No audit validator, artifact trust, evidence ledger, or review-gate behavior changes.
- No commits or pushes.
