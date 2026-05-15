# Plan

## Implementation plan

1. Add malformed-report detection in `packages/shared/src/auditReportValidator.ts`.
   - Add a `malformed_report_artifact` issue code.
   - Detect literal escaped-newline report blobs that contain report structure markers but few or no physical newlines.
   - Reject invalid command citations such as `cat file:1-2` as placeholder/invalid verification evidence when they claim path-range reads that are not shell-valid.
2. Map the new issue code in `packages/shared/src/auditRoadmapContract.ts`.
   - Treat it as `invalid_artifact_content`.
   - Keep existing artifact states unchanged.
3. Propagate malformed-report issues through `packages/shared/src/taskCompletionEvidence.ts`.
   - Ensure validator evidence blockers include malformed artifacts.
   - Ensure top-level task completion issues preserve the concrete validator code and blocked reason.
4. Harden source-report terminalization in `packages/agent/src/coordinator.ts`.
   - When terminal source-inconclusive handling cannot read the declared report artifact, record `missing_report_artifact` diagnostics in `validationDetails`.
   - Include artifact path, branch name, worktree path, project root, content SHA, terminalization reason, and blocked reason.
   - Preserve terminal source-inconclusive semantics only when appropriate; missing artifact attempts must be observable as missing diagnostics.
5. Harden branch/worktree visibility for audit source report content.
   - Add a regression proving synthesis or artifact inspection can read the declared report from the producer branch/worktree when metadata points there.
   - Add a regression for the failure mode where metadata points at a branch/worktree but the declared artifact cannot be read; the artifact attempt must carry `missing_report_artifact` or equivalent structured visibility diagnostics rather than silently trusting plan text or becoming generic source-inconclusive.
   - Preserve existing behavior where validated branch-visible reports can feed synthesis without requiring the report to be present in the current checkout.
6. Add or update focused regression tests.
   - Validator: escaped literal `\n` reports, invalid `cat file:1-2` verification commands, nonexistent file citations, invalid line refs, placeholder manifests, inventory-only no-findings, and successful substantive no-findings.
   - Completion evidence: missing expected report path, malformed report path, concrete issue propagation, and valid report acceptance.
   - Coordinator/implementer: missing report artifact during terminalization, branch/worktree-visible source report retrieval, branch/worktree metadata when retrieval fails, and deterministic repair output remains readable markdown.
7. Update RDPI result and memsync artifacts only after `PLAN PASS`, implementation, `TEST PASS`, and `REVIEW PASS`.

## Acceptance criteria

- A generated source audit card cannot end operationally ambiguous: missing, malformed, invalid, trusted valid, and terminal source-inconclusive outcomes are distinguishable in validation details and attempts.
- Missing declared report artifacts are recorded with `missing_report_artifact` diagnostics and `contentSha: null`.
- Branch/worktree-visible report artifacts are read from the declared producer location or fail with structured visibility diagnostics naming the branch/worktree and artifact path.
- Plan text alone never counts as the report artifact; only the declared report artifact path is accepted.
- Literal escaped-newline markdown blobs are rejected as malformed.
- Placeholder manifest fields and placeholder content hashes/source snapshots remain rejected.
- Nonexistent path refs and out-of-range line refs remain rejected.
- Inventory-only no-findings and invalid commands such as `cat file:1-2` remain rejected.
- Substantive no-findings reports with existing path lines, scoped risk hypotheses, and observed command output still pass.
- Rework metadata includes concrete validator issue codes, not only a broad `source_inconclusive` label.

## Verification plan

- Run focused unit tests after implementation:
  - `npm.cmd test --workspace=@aif/shared -- auditReportValidator`
  - `npm.cmd test --workspace=@aif/shared -- taskCompletionEvidence`
  - `npm.cmd test --workspace=@aif/shared -- auditRoadmapContract`
  - `npm.cmd test --workspace=@aif/agent -- coordinator`
  - `npm.cmd test --workspace=@aif/agent -- implementer`
- Include explicit branch/worktree regression cases in the coordinator/implementer test subset:
  - Report exists on producer branch/worktree and is retrieved for synthesis or artifact validation.
  - Report is absent from the declared producer branch/worktree and records `missing_report_artifact`/visibility diagnostics.
- Run broader repo checks if focused tests pass:
  - `npm.cmd run lint`
  - `npm.cmd test`
  - `npm.cmd run build`
- Independent gates:
  - `PLAN PASS` from reviewer before edits.
  - `TEST PASS` from tester after verification.
  - `REVIEW PASS` from reviewer after implementation and tests.

## Reusable patterns

- Model artifact absence and artifact invalidity as separate states/families.
- Add first-class issue codes for new report failure classes before routing them to broader failure families.
- Keep terminal inconclusive artifacts useful by preserving reason codes, expected paths, branches/worktrees, content hashes, and last validator details.
