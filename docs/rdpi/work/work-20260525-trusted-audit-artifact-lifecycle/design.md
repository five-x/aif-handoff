# Design: Trusted Audit Artifact Lifecycle

## Goal

Introduce a deterministic audit artifact trust contract that makes roadmap-valid audit artifact state depend on one coherent lifecycle: draft report text, finalized manifest, validator pass, committed git blob, revalidation of that committed blob, and final artifact-valid evidence.

## Scope

In scope:

- Shared audit report validation and completion evidence.
- Roadmap artifact trust predicates and attempt validation details.
- Agent/API artifact promotion paths that currently set `state: "valid"`.
- Focused shared/data tests covering uncommitted artifacts, committed blob mismatch, missing manifest, missing ledger, stale source snapshot, and fully valid committed artifacts.

Out of scope:

- Database schema migrations unless the existing `validationDetailsJson` bridge is insufficient.
- UI display of lifecycle states.
- Local AIF service, local browser, local e2e, or runtime endpoint checks.
- Creating or executing follow-up child tasks.
- Weakening manifest, source snapshot, ledger identity, artifact path, scope, or content hash checks.

## Proposed model

Add a shared lifecycle evidence model near the existing audit report validator/completion evidence code. The persisted lifecycle can live under `validationDetails.evidence.auditArtifactLifecycle` and should include ordered states with timestamps or booleans plus the failure issue code when invalid.

Required states:

- `draft_written`: report text exists for the declared artifact path.
- `manifest_finalized`: the report has a valid manifest block after normal validator checks.
- `validator_passed`: `validateAuditReportArtifact()` passes for the worktree text.
- `git_committed`: the declared artifact path is present in `HEAD` and is not dirty/untracked/staged in the worktree.
- `committed_blob_revalidated`: `HEAD:<artifactPath>` was read and independently validated with the same task, manifest, source snapshot, ledger, and artifact-path context.
- `artifact_state_valid`: all previous states are satisfied and the committed blob validation matches the worktree validation hashes.

The lifecycle verifier should return:

- `ok`
- `states`
- `issueCode` / `issues`
- `worktreeArtifactSha256`
- `committedArtifactSha256`
- `worktreeContentSha256`
- `committedContentSha256`
- `committedRef`, normally `HEAD`
- `artifactPath`
- nested committed-blob `AuditReportValidationResult` or a compact validation summary suitable for `validationDetailsJson`

Hard failure codes:

- `audit_artifact_uncommitted`: path is missing from `HEAD`, untracked, staged, deleted, or dirty in the worktree.
- `committed_blob_mismatch`: committed blob was readable and valid enough to hash, but differs from the previously validated worktree artifact or its manifest/body content hash differs.
- Existing manifest/ledger/source snapshot failures remain as-is and continue to surface from the committed-blob validation result.

Mismatch precedence is strict: if the declared artifact path exists in `HEAD` and the committed blob differs from the validated worktree artifact, `committed_blob_mismatch` must be emitted. The verifier may also report `audit_artifact_uncommitted` for dirty/staged worktree state, but it must not hide the committed-blob mismatch behind the uncommitted code. This is the primary reachable drift case in completion validation: worktree text passes validation while `HEAD:<artifactPath>` still contains different bytes.

## Integration

`evaluateTaskCompletionEvidence()` should keep its current worktree validation to produce detailed existing diagnostics, then call the lifecycle verifier for audit report/synthesis artifacts when completion validation is relevant. If lifecycle verification fails, `result.ok` must be false and the hard code should appear in `result.issues`. The evidence payload should include the lifecycle result, even on failure.

Agent and API valid promotion paths should persist lifecycle-verified details rather than trusting `result.ok` alone:

- `packages/agent/src/coordinator.ts` promotion from completion evidence.
- `packages/api/src/services/taskEvents.ts` approve-done promotion.
- Deterministic repair/promotion paths in `packages/agent/src/subagents/implementer.ts` where strict validation may directly mark artifacts valid.

Data trust predicates should require `auditArtifactLifecycle.artifact_state_valid` at the central trust-helper layer, not only in summary counts. The lifecycle requirement must apply to every path that treats an artifact or attempt as trusted:

- source classification trust helpers such as `validationDetailsHaveTrustedAuditSourceClassification()` or an equivalent central helper;
- artifact counts via `roadmapArtifactCountsAsValid()`;
- attempt trust via `attemptTrustedForSynthesisInput()`;
- validated report exports via `listValidatedRoadmapReportArtifacts()`;
- synthesis input exports via `listRoadmapReportArtifactsForSynthesis()`.

Synthesis artifacts should also require lifecycle proof when they are persisted as `state: "valid"` and used as trusted roadmap output. Terminal inconclusive/manual exception paths remain non-trusted and should not require artifact-valid lifecycle proof to represent failure/terminal evidence.

## Failure behavior

- Worktree-only valid report: blocked with `audit_artifact_uncommitted`.
- Dirty committed path after validation where `HEAD:<artifactPath>` differs from the validated worktree artifact: blocked with `committed_blob_mismatch` and may also include `audit_artifact_uncommitted`.
- Committed path exists but worktree validation was done on different bytes: blocked with `committed_blob_mismatch`.
- Missing manifest: existing `missing_report_manifest` remains blocking; lifecycle stops before `manifest_finalized`.
- Missing ledger: existing `missing_audit_evidence_ref` or `missing_report_manifest` remains blocking; lifecycle stops before `validator_passed`.
- Stale source snapshot: existing `manifest_source_snapshot_mismatch` remains blocking; lifecycle stops before `validator_passed` or committed revalidation.
- Fully valid committed artifact: lifecycle reaches `artifact_state_valid`, completion evidence passes, roadmap artifact can count as valid.

## Risks

- The existing code has several valid-promotion paths. Missing one would leave a bypass, so plan includes source search and data predicate tests.
- Existing `contentSha` stores the full artifact hash, while manifest `contentSha256` stores report body hash without manifest blocks. The lifecycle must compare each hash to the matching kind only.
- Whole-repo dirty state is common in this workspace; the lifecycle should inspect the declared artifact path, not require the entire repo to be clean.
- Persisting lifecycle evidence in JSON avoids schema churn but depends on data predicates being strict about the JSON shape.
