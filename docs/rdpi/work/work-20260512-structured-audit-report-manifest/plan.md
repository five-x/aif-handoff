# Plan: Structured Audit Report Manifest

## Implementation steps

1. Add shared manifest types and parsing helpers to `packages/shared/src/auditReportValidator.ts` or a narrow sibling module exported through `packages/shared/src/index.ts`.
2. Extend `AuditReportValidationInput` with optional expected identity fields:
   - `taskId`
   - `roadmapBatchId`
   - `roadmapAlias`
   - `auditPlanId`
   - `expectedReportArtifactPath`
   - `expectedSourceSnapshot`
3. Extend `AuditReportValidationResult` with:
   - `artifactSha256`
   - `contentSha256`
   - `manifest`
   - `manifestVersion`
   - `manifestStatus`
   - `sourceSnapshot`
   - manifest issue details
4. Add JSON fenced block parsing for `audit-report-manifest`, including body-hash computation with manifest blocks removed.
5. Add a single source-reader abstraction that can read from either the live validation root or a declared Git commit/tree snapshot.
6. Route referenced path classification, line-reference checks, false missing path claims, scope coverage, and source evidence classification through the source reader.
7. Add manifest validation issue codes and fail closed when a present manifest contradicts expected task, batch, alias, artifact path, content hash, outcome, or source snapshot.
8. Define rollout audit-plan identity as `task:<taskId>` for standalone audit reports and `batch:<batchId>:task:<taskId>` for roadmap batch artifacts; reject any other manifest `auditPlanId` when the expected value is known.
9. Derive or pass expected source snapshots from artifact validation context:
   - worktree root if the task has `worktreePath`;
   - restored task branch root when branch-bound validation runs in the shared checkout;
   - current validation root otherwise.
10. Extend `TaskCompletionEvidenceTask` and the coordinator/API/auto-review call sites with `roadmapBatchId`, `roadmapAlias`, `auditPlanId`, and expected source snapshot so batch identity mismatches fail in shared validation.
11. Update agent/API artifact state persistence to pass `contentSha: result.evidence.auditReportValidation.artifactSha256` for both valid and invalid audit artifact validations.
12. Update data-layer trusted artifact counting so manifest-backed `validated_no_findings` counts as trusted, markdown-only no-findings is downgraded, and compatibility `validated_findings_present` remains accepted.
13. Update audit roadmap generation text so generated source audit tasks ask for an `audit-report-manifest` JSON block and the rollout `auditPlanId` rule.
14. Add focused tests:

- valid manifest-backed no-findings report passes and exposes version/hash/snapshot;
- manifest content hash mismatch fails;
- manifest task/batch/artifact mismatch fails;
- manifest source snapshot mismatch against the expected commit/tree fails;
- line reference valid in live worktree but invalid in declared snapshot fails;
- source classification cannot become valid from current-worktree-only files when the declared snapshot lacks them;
- markdown-only no-findings is not counted as trusted batch valid;
- persisted roadmap artifact state includes `contentSha` and manifest details.
- invalid manifest validation also persists `contentSha` and failure details.

## Verification plan

Run targeted checks first:

- `npm.cmd test --workspace=@aif/shared -- src/__tests__/auditReportValidator.test.ts src/__tests__/taskCompletionEvidence.test.ts`
- `npm.cmd test --workspace=@aif/data -- src/__tests__/index.test.ts`
- `npm.cmd test --workspace=@aif/agent -- src/__tests__/coordinator.test.ts src/__tests__/implementer.test.ts src/__tests__/reviewGate.test.ts`
- `npm.cmd test --workspace=@aif/api -- src/__tests__/roadmapGeneration.test.ts src/__tests__/tasks.test.ts`

Then run broader project checks if targeted tests expose cross-package regressions:

- `npm.cmd test`
- `npm.cmd run build`

## Acceptance criteria

- Reports can include a structured manifest block.
- Present manifest blocks are parsed deterministically and invalid JSON or mismatches fail closed.
- Manifest-backed validation records report version, source snapshot, artifact hash, body hash, outcome, scope, risks, findings/no-findings claims, and evidence refs.
- Source line references use declared snapshot semantics when a Git commit/tree snapshot is provided.
- Roadmap batch artifact state stores content SHA and manifest/snapshot details in existing persistence.
- Legacy markdown-only no-findings reports are downgraded from trusted batch no-findings.
