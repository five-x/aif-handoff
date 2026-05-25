# Trusted Audit Artifact Lifecycle

- Task ID: work-20260525-trusted-audit-artifact-lifecycle
- Lane: work
- Status: done
- Priority: critical
- Created: 2026-05-25
- Due: immediate
- Source: External independent review `operator-supplied external review file aif-independent-code-review-6713a389.md` for commit `6713a389e326cadbeeb5f7c244f491a02ec15c55`.
- RDPI Needed: yes
- RDPI Path: `docs/rdpi/work/work-20260525-trusted-audit-artifact-lifecycle`

## Request

Introduce a strict trusted audit artifact lifecycle so an audit artifact can become roadmap-valid only after its manifest, runtime evidence ledger, source snapshot binding, validation result, git commit state, and committed blob content have all been verified as one trust contract.

The lifecycle must be explicit and fail closed:

- `draft_written`
- `manifest_finalized`
- `validator_passed`
- `git_committed`
- `committed_blob_revalidated`
- `artifact_state_valid`

After commit, the validator must re-read the artifact from git, for example via the equivalent of `git show HEAD:<artifactPath>`, and validate that committed blob before marking roadmap artifact state valid.

## Done When

- Audit artifact state cannot become valid from a worktree-only artifact.
- A validated worktree artifact that is not committed produces a hard reason code such as `audit_artifact_uncommitted`.
- A committed artifact whose blob differs from the validated worktree artifact produces a hard reason code such as `committed_blob_mismatch`.
- Manifest finalization, validator pass, git commit, and committed-blob revalidation are represented as distinct lifecycle states or equivalent typed evidence.
- Tests cover uncommitted artifact, committed blob mismatch, missing manifest, missing ledger, stale source snapshot, and fully valid committed artifact cases.

## Constraints

- Do not weaken existing manifest, scope, source snapshot, content hash, ledger identity, or artifact path checks.
- Do not accept markdown report prose as a trusted substitute for manifest, ledger, or committed blob validation.
- Do not run local AIF service, local browser, or local e2e checks. Runtime/e2e verification is remote-only against `192.168.88.67`.
- This is an implementation task, but this intake card does not execute it.

## Verification Plan

- Focused source tests for audit artifact lifecycle and validator state transitions.
- Completion-evidence regression for dirty/uncommitted artifacts and committed blob mismatch.
- `npm.cmd test --workspace=@aif/shared -- auditReportValidator taskCompletionEvidence`
- `npm.cmd test --workspace=@aif/data -- index`
- `npm.cmd run lint`
- `npm.cmd run build`
