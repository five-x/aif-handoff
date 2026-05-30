# Plan

## PLAN PASS Scope

Implement only the selected task `work-20260530-stage-aware-runtime-routing-and-qwen-caps`.

## Steps

1. Add shared runtime stage policy.
   - Create `packages/shared/src/runtimeStagePolicy.ts`.
   - Export policy helpers from `packages/shared/src/index.ts`.
   - Add focused shared tests for Qwen default denial, explicit allow, canary allow, explicit stage deny, and cap parsing.

2. Apply stage-aware filtering in data runtime resolution.
   - Update `resolveEffectiveRuntimeProfile`.
   - Update `resolveEffectiveRuntimeProfileExcluding`.
   - Update `resolveEffectiveRuntimeProfilesForTasks`.
   - Add data tests for Qwen implementer skip/fallback and explicit allow.

3. Enforce stage policy and caps in subagent execution.
   - Re-evaluate selected profiles in `packages/agent/src/subagentQuery.ts`.
   - Throw sanitized permission-category runtime errors for denied selected profiles or configured-but-incapable implementer selections.
   - Apply caps to runtime execution intent, first-activity retry attempts, and adapter options.
   - Add subagent tests for denied Qwen routing and explicitly enabled capped routing.

4. Block configured-but-incapable implementers before coordinator claim.
   - Update `packages/agent/src/coordinator.ts` to block no-capable configured implementer selection before semaphore/claim and before `runImplementer`.
   - Add coordinator coverage.

5. Add sanitized stage-capability error handling.
   - Update `packages/agent/src/stageErrorHandler.ts`.
   - Add stage-error tests for no raw provider text and operator-readable runtime-stage messages.

6. Enforce Qwen context/token cap options in the adapter.
   - Update `packages/runtime/src/adapters/qwenLocalAgent/api.ts` budget resolution.
   - Add runtime tests proving a configured context cap fails closed before `fetch`.

7. Verify.
   - Run focused tests:
     - `npm.cmd test --workspace=@aif/shared -- --run src/__tests__/runtimeStagePolicy.test.ts`
     - `npm.cmd test --workspace=@aif/data -- --run src/__tests__/runtimeProfileResolution.test.ts`
     - `npm.cmd test --workspace=@aif/agent -- --run src/__tests__/subagentQuery.test.ts src/__tests__/stageErrorHandler.test.ts src/__tests__/coordinator.test.ts`
     - `npm.cmd test --workspace=@aif/runtime -- --run src/__tests__/qwenLocalAgent.test.ts`
   - Run required gates:
     - `npm.cmd run format:check`
     - `npm.cmd run lint`
     - `npm.cmd test`
     - `npm.cmd run build`

## Independent Gates

- Before implementation: independent reviewer must return `PLAN PASS`.
- After implementation: independent tester must return `TEST PASS`.
- Before close-out: independent reviewer must return `REVIEW PASS`.

## Rollback

- Revert the shared policy helper and call sites.
- Existing runtime profile schema and profile option payloads remain compatible because no migration is introduced.
