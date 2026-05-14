<!-- Managed task artifact for work-20260513-make-audit-report-rework-deterministic-until-valid. -->

# Plan

## Implementation plan

1. Add a strict full-context audit report validation helper in `packages/agent/src/subagents/implementer.ts`, reusing existing data-layer artifact metadata and audit evidence ledger reads.
2. Add deterministic repair finalization that validates immediately after writing the report and before `runImplementer()` returns.
3. Update artifact/task terminalization for unresolved deterministic repair failures:
   - valid reports can proceed toward review;
   - `source_inconclusive` persists terminal non-trusted artifact state and prevents trusted-source accounting;
   - unresolved validator failures set manual-review-required/blocked state with exact issue codes and artifact path.
4. Replace the repeated deterministic repair fallback to general runtime implementation with deterministic terminalization.
5. Add focused tests:
   - repeated same-issue rework does not call the runtime implementer;
   - placeholder manifest values such as `<computed_sha256>` or `<source_snapshot>` are rejected;
   - successful deterministic repair validates with ledger-bound evidence;
   - deterministic inconclusive/manual terminalization records exact issue codes and artifact path.
6. Run targeted validation, then broader package validation if targeted tests pass.
7. Record result, run `$memsync MODE=auto LANE=work TASK_ID=work-20260513-make-audit-report-rework-deterministic-until-valid`, and update only this task's status entry after gates pass.

## Acceptance criteria

- Audit report rework runs strict validation after writing the report and before returning to review.
- Manifest fields are generated from runtime state, never placeholders.
- Report evidence refs are ledger-bound or the report terminalizes with exact unresolved validator issues.
- Directory scope coverage uses representative existing file citations plus command evidence naming the directory.
- Deterministic repair failure terminalizes as `source_inconclusive` or manual-review-required before general runtime implementation can be final authority.
- Existing successful feature and non-audit flows remain unchanged.
- Independent `PLAN PASS`, `TEST PASS`, and `REVIEW PASS` are recorded.

## Verification plan

- `npm.cmd test --workspace=@aif/agent -- src/__tests__/implementer.test.ts`
- `npm.cmd test --workspace=@aif/agent -- src/__tests__/coordinator.test.ts`
- `npm.cmd test --workspace=@aif/shared -- src/__tests__/auditReportValidator.test.ts src/__tests__/taskCompletionEvidence.test.ts`
- `npm.cmd run lint --workspace=@aif/agent`
- `npm.cmd run build --workspace=@aif/agent`
- `git diff --check`

## Reusable patterns

- For strict artifact repair, run deterministic validator authority in the same stage that writes the artifact, before handing the task to an LLM or review loop.
