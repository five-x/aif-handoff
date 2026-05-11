# Design - Review Gate Uses Audit Validator

## Goal

Make `evaluateReviewCommentsForAutoMode()` fail closed for risky audit/review/discovery report artifacts whenever the shared completion/audit report validator rejects the artifact, regardless of sidecar advisories or no-blocker review output.

## Non-Goals

- Do not change the audit report validator issue definitions in this task.
- Do not alter roadmap batch persistence schema.
- Do not create or execute follow-up tasks from review findings.
- Do not remove the legacy malformed-output manual review behavior.

## Design

Add a deterministic validator precheck inside `reviewGate.ts`:

- For non-risky tasks or calls without `task`, no new behavior.
- For risky tasks, call `evaluateTaskCompletionEvidence()` with the same task and `projectRoot`, forcing `manualReviewRequired` false so manual flags do not mask deterministic artifact validity.
- If the result is `ok`, the review gate continues with the existing structured/legacy/fallback sidecar decision.
- If `result.evidence.auditReportValidation.issues` is non-empty, convert those validator issues directly into `review_gate` `AutoReviewFinding` entries. The blocking text must preserve the validator issue code and validator message.
- If completion evidence is not `ok` but the audit validator has no content issues, convert the completion evidence issue into a separate `review_gate` guard finding. This handles missing/uncommitted artifacts without losing the direct validator mapping when validator issues exist.
- Merge validator findings with sidecar parsed/fallback findings.
- Return `request_changes` when deterministic validator findings exist and the review gate can decide the artifact is invalid.
- Preserve `closure_first` behavior: if previous blockers are resolved but new validator blockers appear, return `manual_review_required` with the existing `new_blockers_after_rework` reason.

## Finding Format

Use stable validator text that includes the issue code and message:

`Audit report validator blocked completion (<code>): <message>`

IDs should be generated through `createAutoReviewFindingId("review_gate", text)` so duplicates dedupe through existing merge logic.

Use completion guard fallback text only for non-validator guard failures:

`Audit completion evidence blocked review gate (<code>): <message>`

## Acceptance Mapping

- Structured no-blocker comments plus invalid report: `request_changes` with direct validator findings.
- Legacy `## Blocking Findings - none` plus invalid report: `request_changes`.
- Fallback `SUCCESS` plus invalid report: `request_changes`.
- Sidecar blockers plus invalid report: request changes include both sidecar and validator findings.
- Valid committed substantive report plus advisory-only comments: existing success behavior remains.

## Files Expected To Change

- `packages/agent/src/reviewGate.ts`
- `packages/agent/src/__tests__/reviewGate.test.ts`
- RDPI result/memory artifacts and work status after gates pass.
