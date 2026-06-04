# Design - 07_same_failure_fingerprint_fail_closed

## Scope

Implement a canonical same-failure fingerprint guard for audit/report completion failures, review-gate/completion-evidence failures, and implementation manifest/evidence failures that currently re-enter agent rework. Keep existing audit validation strictness and existing display-oriented `failureSignature` compatibility.

Out of scope:

- Runtime provider/tool-loop fingerprinting already covered by earlier tasks.
- Live runtime validation or production evidence collection.
- Creating or executing follow-up cards.

## Fingerprint model

Add a shared helper for canonical failure fingerprints, preferably in a new `packages/shared/src/auditFailureSignature.ts` or adjacent shared module exported from `packages/shared/src/index.ts`.

The helper should accept:

- `taskId`
- `stage`
- `artifactPath`
- `artifactSha`
- `validatorIssueCodes`
- `validationFingerprint`
- `blockingFindingIds`
- `sourceSnapshotId`
- `allowedWritePaths`
- `failureFamily`

It should normalize arrays by trimming, lowercasing where paths/codes are already case-insensitive in local conventions, removing duplicates, sorting, and normalizing path separators to `/`. The public fingerprint must be a full SHA-256 hex digest of a stable JSON payload. The helper should also expose or retain the normalized input object for validation details and tests.

Audit/report construction should use:

- task id from `TaskRow.id`;
- stage from the coordinator phase or review stage (`review_handoff`, `completion`, or `reviewer`);
- artifact path from the roadmap artifact;
- artifact SHA from `result.evidence.auditReportValidation.artifactSha256`;
- validator issue codes from `auditReportValidation.issueCodes` plus completion issue codes when relevant;
- validation fingerprint from `auditReportValidation.validationFingerprint`;
- blocking finding ids from review-gate outcome when available, otherwise validator blocking issue identities/codes;
- source snapshot id from the report manifest/source snapshot or artifact attempt source snapshot;
- allowed write paths from the artifact path plus synthesis allowed artifact paths when present;
- failure family from the existing family selection.

Implementation-manifest construction should use:

- task id from `TaskRow.id`;
- stage `implementation_manifest`;
- artifact path from a stable synthetic path such as `aif-implementation-manifest` when there is no roadmap artifact, or the current artifact path when a roadmap artifact exists;
- artifact SHA from normalized implementation manifest JSON when present, otherwise `null`;
- validator issue codes from `implementationManifestValidation.issues`;
- validation fingerprint from a deterministic hash over normalized manifest validation issue codes, plan manifest hash, manifest evidence refs, actual meaningful changed files, trusted committed changed files, and dirty file state;
- blocking finding ids from issue codes;
- source snapshot id from requirements/source snapshot if available, otherwise `null`;
- allowed write paths from manifest changed files and trusted changed files;
- failure family `implementation_manifest_invalid`.

Review-gate construction should use:

- task id from `TaskRow.id`;
- stage `review_gate`;
- artifact path from the roadmap artifact if present, otherwise `review-comments`;
- artifact SHA from the current roadmap artifact SHA when present, otherwise a deterministic hash of the review fixes/blocking-finding payload;
- validator issue codes from deterministic completion-evidence issue codes, structured parse issue codes, or `review_gate_request_changes` when no specialized validator code is available;
- validation fingerprint from audit validation fingerprint, structured parser fingerprint, or a deterministic hash over normalized blocker ids/statuses/text;
- blocking finding ids from `reviewGate.blockingFindings` / `outcome.autoReviewState.findings`;
- source snapshot id from the artifact/source snapshot when present;
- allowed write paths from current artifact path, blocker closure evidence paths, or empty list when unavailable;
- failure family `review_gate_rework` or the more specific review handoff reason when available.

## Storage and visibility

Preserve existing `failureSignature` semantics for compatibility. Store the new fingerprint under validation details:

```json
{
  "failureFingerprint": "<sha256>",
  "failureFingerprintInput": { "...": "normalized fields" }
}
```

For roadmap artifacts, include these fields in `validationDetails` when `updateRoadmapBatchArtifactState` records rework-requested or terminal attempts. This makes the fingerprint visible in artifact and attempt metadata through existing `validationDetailsJson`.

For non-roadmap implementation evidence rework, persist the same information through structured task-stage artifact metadata, not activity-log parsing. Use `recordTaskStageArtifactAttempt` with a stable stage/kind such as:

```ts
{
  stage: "implementation_manifest",
  kind: "failure_fingerprint",
  label: "Implementation failure fingerprint",
  state: "rejected",
  outcome: "blocked",
  path: "aif-implementation-manifest",
  metadata: {
    failureFingerprint,
    failureFingerprintInput,
    failureFamily: "implementation_manifest_invalid",
    issueCodes,
    explicitOperatorOverride: false
  }
}
```

The repeat check must read prior `task_stage_artifact_attempts.metadata_json` for the same task/stage/kind and compare `failureFingerprint`. Activity-log lines are supplemental observability only and must not be the persistence source of truth.

## Guard behavior

First occurrence:

- Store the fingerprint and return to rework when the existing policy would otherwise allow rework.
- Log an observation event such as `same_failure_fingerprint_observed: <fingerprint>; family=<family>`.

Repeated same fingerprint:

- Do not call the agent rework path again.
- Do not use runtime fallback.
- Move the task to `blocked_external`.
- Set `reworkRequested=false`.
- Set `manualReviewRequired=true` for audit/report and review/manual validation failures.
- Set `manualReviewRequired=false` only for true operator/config/external input families if those paths are brought under this helper.
- Append the exact required activity line: `same_failure_fingerprint_fail_closed: <fingerprint>; family=<family>`.
- Include the fingerprint in the blocked reason or metadata so operators can correlate attempts.

Delta exceptions:

- Changed artifact SHA changes the fingerprint and allows one new rework.
- New evidence refs should feed the validation fingerprint or explicit normalized fingerprint input so one new rework is allowed.
- Changed source snapshot changes the fingerprint.
- Different blocker ids change the fingerprint.
- Changed allowed write paths change the fingerprint.
- Explicit operator override must be a structured, persisted operator action, not an ordinary retry. The implementation should accept an override only when a task-stage artifact attempt or existing operator-control path records metadata such as `explicitOperatorOverride=true` for the current fingerprint. That override permits one new rework and records a new attempt with the override marker consumed/associated with the fingerprint. Ordinary coordinator retries without that metadata still fail closed.

## Call-site design

Audit/report completion evidence:

- Replace `repeatedAuditFailureCount` with a helper that builds the new fingerprint and compares against prior attempts' validation details.
- Remove the dependency on `env.AIF_AUDIT_REPEATED_FAILURE_FAIL_CLOSED` for the repeated same-fingerprint decision.
- Continue recording legacy `failureSignature` for timeline/display compatibility.
- Add the required activity log on terminal same-fingerprint block.

Implementation evidence:

- Extend `returnImplementationEvidenceToReworkIfPossible` so it computes and records a fingerprint before rework.
- Record each implementation evidence failure fingerprint with `recordTaskStageArtifactAttempt(... metadata)` before returning to implementer or blocking.
- If the current fingerprint matches a prior implementation evidence fingerprint for the task and there is no explicit operator override metadata for that fingerprint, block immediately rather than incrementing retry count and returning to implementer.
- Preserve the existing max-rework cap as a separate safety guard.

Review gate:

- Build and persist a canonical fingerprint for every auto-review outcome that would queue another attempt: `rework_requested` and `review_retry_requested`.
- Persist this fingerprint with `recordTaskStageArtifactAttempt(... metadata)` using stage `review_gate` and kind `failure_fingerprint`.
- Compare the current review-gate fingerprint against prior review-gate task-stage attempt metadata before coordinator transitions at `rework_requested` or `review_retry_requested`.
- On a repeated review-gate fingerprint, block as `blocked_external`, set `reworkRequested=false`, set `manualReviewRequired=true` for review/manual failures, and append `same_failure_fingerprint_fail_closed: <fingerprint>; family=<family>`.
- Avoid starting another implementer or reviewer attempt after a repeated same review-gate fingerprint.
- If the existing `ReviewGateOutcome` lacks needed blocker ids/fingerprints, extend the outcome type narrowly to carry a `failureFingerprintCandidate` or enough normalized blocker metadata from `reviewGate.blockingFindings`; do not infer identity from raw free-form comments alone.

API task event path:

- The explorer noted duplicated audit repeated-failure logic in `packages/api/src/services/taskEvents.ts`. During implementation, inspect this path and update it if it can create audit rework/terminal attempts with stale behavior.

## Risks

- Replacing `failureSignature` directly could break UI/workflow expectations. Preserve it and add `failureFingerprint`.
- Normalization must be deterministic across Windows paths.
- Implementation-manifest tasks may not have a roadmap artifact row. The structured fallback is the existing task-stage artifact/attempt metadata path, which avoids schema churn while satisfying the attempt/artifact metadata requirement.
- Review-gate rework/retry tasks also may not have a roadmap artifact row. Use task-stage artifact/attempt metadata for those fingerprints too.
- Existing tests that intentionally asserted content SHA was ignored by legacy signatures should remain valid for `failureSignature`; new tests should target `failureFingerprint`.
