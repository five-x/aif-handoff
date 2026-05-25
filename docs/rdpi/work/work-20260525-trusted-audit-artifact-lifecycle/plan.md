# Plan: Trusted Audit Artifact Lifecycle

Plan status: awaiting independent `PLAN PASS`.

## Implementation steps

1. Add shared lifecycle types and helper functions near `packages/shared/src/auditReportValidator.ts` or `packages/shared/src/taskCompletionEvidence.ts`.
   - Normalize and validate the artifact path using existing path helpers.
   - Detect artifact-path git status with `git status --porcelain=v1 --untracked-files=all -- <artifactPath>`.
   - Read the committed blob with `git show HEAD:<artifactPath>`.
   - Re-run `validateAuditReportArtifact()` against the committed blob with the same task, roadmap, ledger, source snapshot, and artifact-path context.
   - Compare worktree and committed artifact/content hashes.
   - If `HEAD:<artifactPath>` exists but differs from the validated worktree artifact, emit `committed_blob_mismatch` even when dirty/staged state also warrants `audit_artifact_uncommitted`.
   - Return typed lifecycle evidence and hard issue codes.

2. Extend issue-code typing and failure-family mapping.
   - Add `audit_artifact_uncommitted` and `committed_blob_mismatch` to shared audit/completion issue-code unions.
   - Map uncommitted/mismatch failures to fail-closed audit failure families without weakening existing manifest/ledger/snapshot mappings.

3. Wire lifecycle verification into `evaluateTaskCompletionEvidence()`.
   - Keep current validator behavior and existing issue propagation.
   - Add lifecycle evidence into `result.evidence`.
   - Block completion when lifecycle verification fails.
   - Preserve existing `uncommitted_report_artifact` behavior if tests depend on it, while also surfacing the requested hard code `audit_artifact_uncommitted`.

4. Update artifact promotion paths.
   - `packages/agent/src/coordinator.ts`: persist lifecycle evidence when completion evidence passes and only promote lifecycle-valid artifacts.
   - `packages/api/src/services/taskEvents.ts`: same for approve-done path.
   - `packages/agent/src/subagents/implementer.ts`: ensure deterministic strict repair cannot mark an artifact valid without committed-blob lifecycle evidence, or make it use the shared lifecycle helper.

5. Harden data-layer trust predicates at the central trust-helper layer.
   - Require `validationDetails.evidence.auditArtifactLifecycle` to show `artifact_state_valid` before `validationDetailsHaveTrustedAuditSourceClassification()` or an equivalent central helper can treat report validation details as trusted.
   - Ensure that central helper is used by `roadmapArtifactCountsAsValid()`, `attemptTrustedForSynthesisInput()`, validated report listing, synthesis input listing, workflow/timeline trust projection, and any export path that treats a roadmap report as trusted.
   - Keep terminal non-trusted states (`source_inconclusive`, `terminal_inconclusive`, `manual_exception`) separate from trusted valid state.
   - Add compatibility guards so old markdown-only `state: "valid"` rows do not count as trusted valid unless lifecycle evidence is present.

6. Add focused tests.
   - Shared `taskCompletionEvidence` tests:
     - uncommitted worktree artifact returns `audit_artifact_uncommitted`;
     - committed blob mismatch returns `committed_blob_mismatch`;
     - a committed valid artifact modified in the worktree to a different still-valid artifact returns `committed_blob_mismatch`;
     - missing manifest remains blocking;
     - missing ledger remains blocking;
     - stale source snapshot remains blocking;
     - fully valid committed artifact reaches `artifact_state_valid`.
   - Data `index` tests:
     - `state: "valid"` without lifecycle evidence does not count as trusted valid;
     - lifecycle-valid report counts and can release synthesis readiness;
     - `listValidatedRoadmapReportArtifacts()` excludes valid rows without lifecycle evidence;
     - `listRoadmapReportArtifactsForSynthesis()` excludes source attempts without lifecycle evidence;
     - attempts without lifecycle proof are not trusted synthesis inputs;
     - lifecycle failure reason codes propagate through attempts/failure family.

7. Run required verification.
   - `npm.cmd test --workspace=@aif/shared -- auditReportValidator taskCompletionEvidence`
   - `npm.cmd test --workspace=@aif/data -- index`
   - `npm.cmd run lint`
   - `npm.cmd run build`

8. Run gates and close-out.
   - Independent plan reviewer must return `PLAN PASS` before implementation.
   - After implementation, independent tester must return `TEST PASS`; failures go back to implementation and invalidate the test gate.
   - After `TEST PASS`, independent final reviewer must return `REVIEW PASS`; failures go back to implementation and invalidate any affected gates.
   - Only after `PLAN PASS`, `TEST PASS`, and `REVIEW PASS`, write `result.md`, run `$memsync MODE=auto LANE=work TASK_ID=work-20260525-trusted-audit-artifact-lifecycle`, then update only this task in `docs/intake/work_status.json`.

## Acceptance criteria

- Audit artifact state cannot become valid from a worktree-only artifact.
- A validated worktree artifact that is not committed emits `audit_artifact_uncommitted`.
- A committed artifact whose blob differs from the validated worktree artifact emits `committed_blob_mismatch`.
- Manifest finalization, validator pass, git commit, and committed-blob revalidation are represented as distinct lifecycle states or typed evidence.
- Tests cover uncommitted artifact, committed blob mismatch, missing manifest, missing ledger, stale source snapshot, and fully valid committed artifact.

## Guardrails

- Do not weaken manifest, source snapshot, ledger identity, artifact path, scope, or content hash checks.
- Do not accept markdown prose as a trusted substitute for manifest, ledger, or committed blob validation.
- Do not run local AIF service, local browser, or local e2e checks.
- Do not create or execute child tasks in this run.
