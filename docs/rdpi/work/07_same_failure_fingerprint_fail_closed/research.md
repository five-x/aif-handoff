# Research - 07_same_failure_fingerprint_fail_closed

## Task framing and lane

- Task ID: `07_same_failure_fingerprint_fail_closed`.
- Lane: `work`.
- Source spec: `C:\Users\apron\Desktop\aif_stabilization_tz_pack\07_same_failure_fingerprint_fail_closed.md`.
- Goal: repeated identical failure fingerprints from validator/review/completion-evidence guards must fail closed instead of starting another agent rework or runtime fallback.
- Required fingerprint fields: `taskId`, `stage`, `artifactPath`, `artifactSha`, `validatorIssueCodes`, `validationFingerprint`, `blockingFindingIds`, `sourceSnapshotId`, `allowedWritePaths`, and `failureFamily`.
- Required terminal behavior for repeated fingerprints: do not start agent rework, do not use runtime fallback, move task to `blocked_external`, log `same_failure_fingerprint_fail_closed: <fingerprint>; family=<family>`, set `manualReviewRequired=true` for audit/report manual review cases, and set `manualReviewRequired=false` for true operator/config/external blockers.

## Accepted planning sources or local facts

- RDPI preflight was required before artifact work. It returned `STATUS: refreshed`, so managed instructions were re-read before this artifact was created.
- `AGENTS.md` says non-trivial work follows RDPI, local repo facts outrank memory, mandatory gates are fail-closed, and implementation requires independent `PLAN PASS`, `TEST PASS`, and `REVIEW PASS`.
- The related queued intake card `docs/intake/work/work-20260602-same-failure-recovery-gates.md:15` asks for same-failure fingerprints and artifact-delta recovery gates. Its done-when criteria require fingerprint fields at `docs/intake/work/work-20260602-same-failure-recovery-gates.md:19`, second identical fingerprint fail-close at `docs/intake/work/work-20260602-same-failure-recovery-gates.md:20`, audit/report manual review at `docs/intake/work/work-20260602-same-failure-recovery-gates.md:21`, fresh-evidence/artifact-delta retry at `docs/intake/work/work-20260602-same-failure-recovery-gates.md:23`, activity logging at `docs/intake/work/work-20260602-same-failure-recovery-gates.md:24`, and no weakening of audit validation at `docs/intake/work/work-20260602-same-failure-recovery-gates.md:28`.
- `packages/agent/src/coordinator.ts:3000` currently makes repeated audit failure blocking depend on `env.AIF_AUDIT_REPEATED_FAILURE_FAIL_CLOSED`; the TZ requires fail-closed behavior independent of an optional env flag.
- `packages/agent/src/coordinator.ts:3020` currently describes the terminal audit case as a repeated audit artifact failure signature, not the requested `same_failure_fingerprint_fail_closed` event.
- `packages/agent/src/coordinator.ts:2889` logs implementation evidence guard rework by issue codes only. There is no same-fingerprint guard in the implementation evidence rework path.
- `packages/agent/src/coordinator.ts:1459` test coverage already expects repeated audit signature fail-close. `packages/agent/src/__tests__/coordinator.test.ts:5625`, `packages/agent/src/__tests__/coordinator.test.ts:5688`, and `packages/agent/src/__tests__/coordinator.test.ts:5938` cover implementation manifest/evidence guard failure paths that need repeat-fingerprint behavior.
- `packages/shared/src/auditRoadmapContract.ts:376` defines `AuditFailureSignatureInput`, and `packages/shared/src/auditRoadmapContract.ts:384` builds the current compatibility signature. It is a stable display signature over role/classification/family/issue codes, not a SHA-256 fingerprint over the TZ field set.
- `packages/shared/src/schema.ts:349` and `packages/shared/src/schema.ts:352` store artifact `contentSha` and `failureSignature`; `packages/shared/src/schema.ts:381` and `packages/shared/src/schema.ts:382` store attempt `failureSignature` and `contentSha`. Existing storage can hold a compatibility signature, but the new fingerprint should also be visible in validation details/metadata.
- `packages/data/src/index.ts:9638` computes the existing failure signature during `updateRoadmapBatchArtifactState`, and `packages/data/src/index.ts:9658` inserts an artifact attempt with the computed fields.
- `packages/shared/src/schema.ts:250` and `packages/shared/src/schema.ts:278` store `metadataJson` on generic task-stage artifacts and attempts. `packages/data/src/index.ts:2494` accepts `metadata` for `recordTaskStageArtifactAttempt`, and `packages/data/src/index.ts:2578` persists it on the attempt row. This is the structured metadata path for implementation-manifest failures that do not naturally have roadmap artifact attempts.
- `packages/shared/src/taskCompletionEvidence.ts:103` exposes completion-evidence result details; `packages/shared/src/taskCompletionEvidence.ts:137` includes `implementationManifestValidation`.
- `packages/shared/src/implementationManifest.ts:98` enumerates implementation manifest issue codes. `packages/shared/src/implementationManifest.ts:146` exposes manifest validation results with `manifest`, `normalizedJson`, `planManifestHash`, and `issues`.
- `packages/agent/src/reviewGate.ts:599` already includes audit `validationFingerprint` in deterministic blocker text. `packages/agent/src/reviewGate.ts:1486` has structured parser fingerprints, but neither is the requested canonical failure fingerprint.
- `packages/agent/src/autoReviewHandler.ts:512` handles `request_changes`; `packages/agent/src/autoReviewHandler.ts:555` can return `review_retry_requested`, and `packages/agent/src/autoReviewHandler.ts:597` can return `rework_requested`. `packages/agent/src/coordinator.ts:3823` and `packages/agent/src/coordinator.ts:3852` then queue another implementer or reviewer transition. These review-gate queue paths need the same same-failure fingerprint guard before the transition.
- Explorer gate independently found the same major mismatches: audit repeat handling exists but is env-gated and uses the older signature; current audit signature intentionally ignores content SHA; implementation evidence rework has no repeat fingerprint storage/check; the required activity log is absent; and reusing `failureSignature` as the SHA fingerprint may disrupt display/UI compatibility.

## Same-project memory

- Not consulted before `PLAN PASS`. The RDPI contract for this run prohibits shared-memory recall before planning approval unless explicitly waived. Local repo facts and local docs were sufficient for planning.

## Cross-project reusable patterns

- Not consulted before `PLAN PASS` for the same reason. Reusable pattern lookup can be considered after `PLAN PASS` only if implementation hits an unresolved design question.

## Rejected or stale memory candidates

- `docs/memory/tasks/work/work-20260512-audit-artifact-lifecycle-hypotheses.md` argues that repeated same-failure signatures should ignore `contentSha`, but the current TZ explicitly requires `artifactSha` in the failure fingerprint and treats changed artifact SHA as a retry-permitting delta. That older hypothesis is stale for this task.
- Existing compatibility `failureSignature` behavior that ignores content SHA should not be removed casually because data/UI projections display it. Treat it as a legacy/display signature and add the requested SHA-256 `failureFingerprint` as the no-progress guard key.
