# Plan - 08_runtime_recovery_delta_guard

## Implementation steps

1. Add coordinator-local runtime recovery delta helpers.
   - Add stable normalization and SHA-256 fingerprinting for runtime recovery signatures in `packages/agent/src/coordinator.ts`.
   - Add helpers to read prior `runtime_recovery` / `delta_guard` task-stage attempts.
   - Add helpers to record allowed and rejected delta-guard attempts.
   - Add a small `failClosedRuntimeRecoveryNoDelta()` helper that applies the required blocked task state and activity log.

2. Wire the guard into runtime recovery call sites.
   - `handleContextLengthRecovery`: guard before scheduling fallback.
   - `handleTransientRuntimeFallbackRecovery`: guard before scheduling transient fallback.
   - `handleAuditReportTimeoutRecovery`: guard before bounded audit timeout retry.
   - `handleAuditReportTransientRecovery`: guard before bounded audit transient retry.
   - `handleRepositoryInspectionBudgetExhaustion`: record signatures and fail closed with the required prefix when the same no-delta signature repeats.

3. Wire post-write audit recovery.
   - Keep current artifact read order.
   - Keep deterministic completion validation for written artifacts.
   - After validation yields audit artifact evidence, build the runtime recovery delta signature.
   - If the signature repeats with the same artifact SHA, validator fingerprint, evidence refs, blocked reason family, tool-loop pattern, and source snapshot, block with `runtime_recovery_no_delta_fail_closed`.
   - If the artifact SHA or validator fingerprint changes, allow existing validation-guided recovery.

4. Preserve existing fail-closed paths.
   - Ensure implementation runtime exhaustion still runs before runtime recovery hooks.
   - Ensure repeated tool-loop classification remains no-retry.
   - Ensure generic `classifyStageError()` external backoff still handles errors not covered by coordinator recovery.

5. Add focused tests.
   - In `packages/agent/src/__tests__/coordinator.test.ts`:
     - timeout after artifact write + same artifact SHA/validation fingerprint -> no retry and required activity log.
     - timeout after artifact write + changed artifact SHA -> existing validation-guided recovery is allowed.
     - audit report timeout bounded retry + same six-field delta -> no retry and `blockedReason` starts with exact prefix `runtime_recovery_no_delta_fail_closed:`.
     - context fallback with the same six required equality fields -> fail-closed no-delta.
     - repository inspection budget exhausted -> no larger fallback retry, with signature metadata.
     - transport same six-field delta -> no bounded retry.
     - stream same six-field delta -> no bounded retry.
     - diagnostic-only metadata differences such as `failedProfileId` or `runtimeCategory` do not allow retry when the six required fields match.
     - audit no-delta block sets `manualReviewRequired=true`.
     - repository-inspection budget no-delta block sets `manualReviewRequired=true`.
     - generic context/transient no-delta block sets `manualReviewRequired=false`.
     - activity log contains `runtime_recovery_no_delta_fail_closed`.
   - In `packages/agent/src/__tests__/stageErrorHandler.test.ts` only if helper exposure requires a regression for provider metadata, otherwise leave existing stage-error tests unchanged.

6. Update `result.md` after implementation and gates.
   - Record `PLAN PASS`, `TEST PASS`, and `REVIEW PASS`.
   - Include the category matrix from the design.
   - Record exact verification commands and outcomes.

## Verification plan

- Targeted first pass:
  - `npm.cmd --workspace @aif/agent test -- --run src/__tests__/coordinator.test.ts -t "runtime recovery"`
  - `npm.cmd --workspace @aif/agent test -- --run src/__tests__/stageErrorHandler.test.ts`
- Broader package pass:
  - `npm.cmd --workspace @aif/agent test -- --run src/__tests__/coordinator.test.ts`
- Final repo-level checks as time allows:
  - `npm.cmd run lint`
  - `npm.cmd run build`
  - `npm.cmd test`

If the test runner rejects the exact filter, use the closest workspace-scoped Vitest command and record the exact command in `result.md`.

## Acceptance mapping

- Recovery is delta-aware: coordinator compares structured runtime recovery signatures before retrying.
- No retry loops without new evidence: repeated identical signatures block as `blocked_external`.
- Existing valid recovery scenarios still pass: changed artifact SHA/validator/source/evidence inputs allow existing recovery logic.
- Activity log contains no-delta reason: tests assert `runtime_recovery_no_delta_fail_closed`.
- `result.md` includes matrix: final close-out must include the required category behavior matrix.

## Gate request

Request independent `PLAN PASS` / `PLAN FAIL` review against:

- `docs/rdpi/work/08_runtime_recovery_delta_guard/research.md`
- `docs/rdpi/work/08_runtime_recovery_delta_guard/design.md`
- `docs/rdpi/work/08_runtime_recovery_delta_guard/plan.md`
