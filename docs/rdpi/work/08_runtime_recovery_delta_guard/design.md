# Design - 08_runtime_recovery_delta_guard

## Scope

Add a coordinator-owned runtime recovery delta guard. The guard blocks automatic recovery when the same task has already attempted the same runtime recovery with no new artifact/evidence/source/tool-loop delta.

In scope:

- runtime categories `timeout`, `context_length`, `transport`, `stream`;
- repository-inspection budget exhaustion;
- post-write audit artifact failures;
- activity-log observability for no-delta blocking;
- focused unit/regression tests in the files named by the task.

Out of scope:

- changing runtime adapter retry semantics;
- changing the existing canonical same-failure fingerprint contract for non-runtime rework;
- adding a database migration;
- changing implementation runtime exhaustion recovery-pack behavior.

## Delta signature

Create a coordinator-local runtime recovery delta signature helper. It should return both a stable fingerprint and normalized metadata.

Normalized fields:

- `taskId`
- `stage`
- `runtimeCategory`
- `recoveryKind`
- `artifactPath`
- `artifactSha`
- `validatorFingerprint`
- `toolLoopPattern`
- `blockedReasonFamily`
- `evidenceRefs`
- `sourceSnapshotId`
- `sourceSnapshotFingerprint`
- `failedProfileId`

The six task-required equality checks map to these fields:

- `sameArtifactSha`: compare normalized `artifactSha`.
- `sameValidatorFingerprint`: compare normalized `validatorFingerprint`.
- `sameToolLoopPattern`: compare normalized `toolLoopPattern`.
- `sameBlockedReasonFamily`: compare normalized `blockedReasonFamily`.
- `sameEvidenceRefs`: compare normalized sorted `evidenceRefs`.
- `sameSourceSnapshot`: compare `sourceSnapshotId` and `sourceSnapshotFingerprint`.

The no-delta decision must compare only these six required equality checks. `taskId` and `recoveryKind` are used only to find the relevant prior attempts for the same task/recovery surface. `runtimeCategory`, `stage`, `artifactPath`, `failedProfileId`, the public fingerprint, and any other metadata are diagnostic context only and must not make an otherwise identical six-field match eligible for retry.

The public fingerprint should be SHA-256 over stable JSON. Arrays must be trimmed, deduplicated, lowercased where conventionally case-insensitive, sorted, and path-normalized where applicable.

## Persistence

Use `recordTaskStageArtifactAttempt()` with:

- `stage: "runtime_recovery"`
- `kind: "delta_guard"`
- `state: "rejected"` for blocked no-delta attempts
- `state: "accepted"` or `inconclusive` for observed attempts that allow existing recovery
- `path`: artifact path when available, otherwise a synthetic path such as `runtime-recovery/<stage>/<category>`
- `sourceSnapshotId`: normalized source snapshot id when available
- metadata:
  - `runtimeRecoveryFingerprint`
  - `runtimeRecoveryFingerprintInput`
  - `runtimeCategory`
  - `recoveryKind`
  - `blockedReasonFamily`
  - `deltaComparison`
  - `decision: "allow_recovery" | "fail_closed_no_delta"`

Compare only prior attempts for the same task with `stage === "runtime_recovery"` and `kind === "delta_guard"`, and the same `recoveryKind`. This prevents an audit post-write validation attempt from blocking an unrelated context fallback solely because both lack evidence.

Do not use activity logs as the comparison source.

## Guard behavior

When an existing recovery path would schedule a bounded retry:

1. Build the current runtime recovery delta signature.
2. Compare the current required fields to prior `runtime_recovery/delta_guard` attempts for the same task and recovery kind.
3. If all required fields are equal to a prior observed attempt, do not schedule retry.
4. Persist a rejected delta-guard attempt.
5. Move the task to `blocked_external` with:
   - `blockedReason: "runtime_recovery_no_delta_fail_closed:<reason>"`
   - `blockedFromStatus` set to the current in-progress status
   - `retryAfter: null`
   - `retryCount` unchanged
   - `reworkRequested: false`
   - `manualReviewRequired` from the matrix below
6. Append activity log:
   - `runtime_recovery_no_delta_fail_closed:<fingerprint>; category=<category>; recovery=<recoveryKind>; reason=<reason>`

If any required field differs, persist an allowed delta-guard attempt and continue the existing bounded recovery behavior unchanged.

## Manual review matrix

- Audit/report artifact recovery, audit timeout/transient recovery, and repository inspection budget exhaustion: `manualReviewRequired = true` when no-delta blocks.
- Generic implementation/development transient fallback and context fallback: `manualReviewRequired = false` when no-delta blocks, matching existing operator-input/runtime fallback behavior.
- Repeated tool-loop no-delta blocks: `manualReviewRequired = false` unless the task intent is `audit`, where it should be `true` because the operator must decide whether the artifact evidence is sufficient.

## Call-site design

### Context Length Recovery

In `handleContextLengthRecovery`, run the guard immediately before `fallback` schedules a retry. Use:

- category `context_length`;
- recovery kind `context_fallback`;
- source snapshot from `task.requirementsSnapshotId`;
- blocked reason family `context_length`;
- failed profile id from `resolveFailedRuntimeProfileForRecovery()`;
- no artifact fields unless a roadmap artifact is present.

If the task has no artifact/evidence fields, the first fallback is allowed and recorded; a second fallback with the same six required equality fields fails closed.
The comparison still uses only the six required fields. A different failed profile id is recorded in metadata for diagnostics but does not create delta by itself.

### Generic Transient Fallback

In `handleTransientRuntimeFallbackRecovery`, run the guard immediately before setting a fallback profile. Use:

- category from `runtimeError.category`;
- recovery kind `transient_runtime_fallback`;
- tool loop pattern from provider metadata when `status === "repeated_tool_loop_blocked"`, including fingerprint/tool/stage/artifact path;
- blocked reason family from provider metadata status or runtime category;
- source snapshot from task requirements snapshot;
- failed profile id from the runtime error or resolved failed profile.

### Audit Report Timeout And Transient Recovery

In `handleAuditReportTimeoutRecovery` and `handleAuditReportTransientRecovery`, run the guard before updating the task back to `stageInProgress`.

Use artifact fields from the roadmap report artifact:

- artifact path from roadmap artifact;
- artifact SHA from `artifact.contentSha` when available;
- source snapshot from artifact source snapshot or task requirements snapshot.

If a readable report artifact exists, optionally validate it through existing audit validation helpers only if already available through the current path. Do not add a new expensive validation step just for the guard before `PLAN PASS` implementation unless tests prove the content SHA is insufficient.

### Post-Write Audit Artifact Failure

In `recoverWrittenAuditArtifactAfterRuntimeFailure`, read the artifact as today, then run deterministic completion validation as today when the artifact text exists.

The guard must operate on the validation result before returning the task to rework:

- artifact SHA from `auditReportValidation.artifactSha256`;
- validator fingerprint from `auditReportValidation.validationFingerprint`;
- evidence refs from the report manifest/validation result;
- source snapshot from `auditReportValidation.sourceSnapshot`;
- blocked reason family `post_write_audit_artifact_failure`.

If the same validation/artifact/evidence/source signature has already been observed for runtime post-write recovery, block with the required runtime no-delta reason instead of returning to another rework attempt. If the artifact SHA or validation fingerprint changes, allow existing validation-guided recovery.

### Repository Inspection Budget Exhaustion

Keep the existing no-fallback behavior. Add a delta signature record so repeated identical repository-inspection exhaustion can be correlated and, when the same delta repeats, blocked with the required `runtime_recovery_no_delta_fail_closed` prefix.

The first occurrence may continue through existing terminalization/blocking. A repeated no-delta occurrence must not attempt a larger fallback context or retry.

### Stage Error Handler

Keep `stageErrorHandler.ts` mostly unchanged. Its existing structured classification remains the fallback when coordinator-specific recovery does not handle the error.

Add tests only if needed to confirm repeated tool-loop provider metadata remains no-retry and exposes enough metadata for coordinator signatures.

## Risk controls

- Do not place the guard before implementation runtime exhaustion handling; that path already fail-closes and records recovery packs.
- Do not skip deterministic post-write audit validation for changed artifacts.
- Do not use raw error message substrings when structured category/provider metadata exists.
- Do not increment `retryCount` when the no-delta guard blocks.
- Preserve current behavior when automatic fallback is disabled by default.

## Result matrix target

`result.md` must include this matrix after implementation:

| Category                                  | No Delta                                                                        | Delta Present                                   |
| ----------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------- |
| `timeout`                                 | `blocked_external`, no retry, `retryAfter=null`                                 | existing bounded recovery policy                |
| `context_length`                          | `blocked_external`, no retry, `retryAfter=null`                                 | existing compatible fallback policy             |
| `transport`                               | `blocked_external`, no retry, `retryAfter=null`                                 | existing transient fallback/backoff policy      |
| `stream`                                  | `blocked_external`, no retry, `retryAfter=null`                                 | existing transient fallback/backoff policy      |
| `repository_inspection_budget_exhaustion` | no larger fallback retry; repeated no-delta uses required blocked reason prefix | existing terminalization/manual-review behavior |
| post-write audit artifact failure         | no rework retry for same artifact/validator/evidence/source                     | existing validation-guided recovery             |
