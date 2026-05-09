# Design

Task ID: `work-20260509-harden-audit-completion-evidence`

## Scope

Harden task completion evidence only. Do not change planner, runtime selection,
or server deployment code in this task.

## Approach

1. Extend `TaskCompletionIssueCode` with:
   - `uncommitted_report_artifact`
   - `deterministic_fallback_report`
2. Split changed-file evidence into:
   - all changed files, preserving existing behavior for normal deltas
   - dirty/uncommitted files from `git status`
   - committed branch-diff files from `base...HEAD` and `base..HEAD` only
   - never classify `git diff HEAD` output as committed evidence; tracked
     dirty files and staged files are dirty/uncommitted evidence via
     `git status --porcelain`
3. Detect explicit committed-report requirements from task text, including
   phrases such as `committed report`, `report is committed`, and
   `report artifact is committed`.
4. For completion phase:
   - if committed report is required, every detected report artifact must be in
     committed branch evidence and must not be dirty/untracked.
   - if an audit/review/discovery task produced the deterministic inventory
     fallback report, block terminal transition using only stable known
     signatures:
     `Deterministic diagnostic report generated`,
     `Diagnostic-only repository inventory report`,
     `No blocking issue found by deterministic inventory check`, or
     `This report records evidence only`.
   - any dirty/uncommitted report artifact blocks a committed-report task even
     if a separate committed report artifact also exists; this is intentionally
     fail-closed because the task promised a clean committed report state.
5. Preserve existing behavior for normal implementation tasks and audit tasks
   that require a report artifact but do not explicitly require a commit.

## Risks

- Overly broad committed-report detection could block normal report tasks. Keep
  the pattern specific to `committed` near `report`.
- Some tests currently rely on untracked report artifacts as acceptable evidence.
  Preserve that for tasks without an explicit committed-report requirement.
- Fallback detection could over-block legitimate reports if markers are too
  broad. Use exact known fallback phrases only.

## Verification

- Add focused unit tests in `packages/shared/src/__tests__/taskCompletionEvidence.test.ts`.
- Cover untracked, tracked dirty, and staged report artifacts when committed
  report evidence is required.
- Run the shared package tests for `taskCompletionEvidence`.
- Run the full shared test suite if the focused tests pass.
