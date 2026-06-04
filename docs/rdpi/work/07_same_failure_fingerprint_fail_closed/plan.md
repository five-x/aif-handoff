# Plan - 07_same_failure_fingerprint_fail_closed

## Implementation steps

1. Add a shared failure-fingerprint helper.
   - Create or extend a shared module with stable input normalization and full SHA-256 output.
   - Export the helper from `packages/shared/src/index.ts`.
   - Add focused shared tests for stable ordering/path normalization and changed artifact SHA/evidence/source/blocker/allowed-write-path deltas.

2. Wire audit/report completion-evidence fingerprints in `packages/agent/src/coordinator.ts`.
   - Build the new fingerprint from `evaluateTaskCompletionEvidence` audit validation details and roadmap artifact context.
   - Persist `failureFingerprint` and normalized input in `validationDetails`.
   - Compare against prior artifact attempts' validation details instead of the old signature-only count.
   - Remove the env flag dependency from the repeated same-fingerprint fail-close decision.
   - Append `same_failure_fingerprint_fail_closed: <fingerprint>; family=<family>` on terminal repeat.
   - Keep existing `failureSignature` behavior for compatibility.

3. Wire implementation-manifest/evidence fingerprints in `packages/agent/src/coordinator.ts`.
   - Compute a deterministic fingerprint when `returnImplementationEvidenceToReworkIfPossible` would return to implementer.
   - Persist each observed fingerprint using `recordTaskStageArtifactAttempt(... metadata)` so both `task_stage_artifacts.metadata_json` and `task_stage_artifact_attempts.metadata_json` expose `failureFingerprint`, `failureFingerprintInput`, and `failureFamily`.
   - Compare the current fingerprint against prior task-stage artifact attempt metadata, not activity-log text.
   - On the next identical fingerprint without explicit override metadata, block as `blocked_external`, `reworkRequested=false`, and `manualReviewRequired=true`, without calling another rework agent.
   - Treat explicit operator override as a structured metadata marker for the current fingerprint that permits one new rework; ordinary retries must not count as override.
   - Keep the existing max rework cap as a fallback guard.

4. Inspect and update adjacent duplicated paths.
   - Check `packages/api/src/services/taskEvents.ts` for repeated audit rework or artifact state updates and keep fingerprint metadata consistent if that path can trigger the same behavior.
   - Add a review-gate/auto-review fingerprint guard before coordinator handles `rework_requested` and `review_retry_requested`.
   - Persist review-gate fingerprints with `recordTaskStageArtifactAttempt(... metadata)` and compare against prior review-gate attempt metadata.
   - Extend `ReviewGateOutcome` narrowly if needed so blocker ids, parse/validation fingerprint, and artifact delta inputs are available without parsing raw comments.

5. Update tests.
   - Add/adjust `packages/agent/src/__tests__/coordinator.test.ts` coverage:
     - same audit validator failure twice: second fail-closed;
     - same implementation manifest failure twice: second fail-closed;
     - changed artifact SHA allows one new rework;
     - new evidence refs allow one new rework;
     - same fingerprint does not start agent;
     - activity log records the required line;
     - roadmap artifact gets terminal/manual state and fingerprint metadata.
     - explicit operator override permits one new rework for a repeated fingerprint, while an ordinary retry still fail-closes.
     - repeated review-gate `rework_requested` fingerprint blocks before starting another implementer attempt;
     - repeated review-gate `review_retry_requested` fingerprint blocks before starting another reviewer attempt;
   - Add/adjust data/workflow assertions that implementation-manifest failure fingerprints are visible in task-stage artifact and attempt metadata, not only activity logs.
   - Add shared helper tests in the most appropriate shared test file, likely `packages/shared/src/__tests__/auditRoadmapContract.test.ts` or a new test beside the helper.
   - Preserve or adjust existing legacy `failureSignature` assertions so they continue to describe display signatures, not the new fingerprint.

## Verification plan

- `npm.cmd test -- packages/shared/src/__tests__/auditRoadmapContract.test.ts packages/shared/src/__tests__/taskCompletionEvidence.test.ts packages/agent/src/__tests__/coordinator.test.ts`
- If the targeted command is not supported by the test runner, use the closest package-level or repo-level command and record the exact command in `result.md`.
- `npm.cmd run lint`
- `npm.cmd run build`

## Acceptance mapping

- Repeated same failure does not create an infinite loop: coordinator tests assert no second agent rework after a matching fingerprint.
- Fail-closed does not depend on an optional env flag: coordinator logic removes the flag from the repeat decision and tests can set the env false if practical.
- Fingerprint visible in metadata/activity: validation details and activity log assertions cover this.
- Implementation fingerprint storage satisfies attempt/artifact metadata requirement: task-stage artifact and attempt metadata assertions cover non-roadmap development failures.
- Explicit operator override exception is covered by a targeted coordinator test.
- Review-gate queue retries are covered by targeted tests proving repeated fingerprints do not start another implementer or reviewer attempt.
- Tests cover audit and development tasks: audit/report and implementation-manifest tests are both included.

## Gate request

Request independent `PLAN PASS` / `PLAN FAIL` review against:

- `docs/rdpi/work/07_same_failure_fingerprint_fail_closed/research.md`
- `docs/rdpi/work/07_same_failure_fingerprint_fail_closed/design.md`
- `docs/rdpi/work/07_same_failure_fingerprint_fail_closed/plan.md`
