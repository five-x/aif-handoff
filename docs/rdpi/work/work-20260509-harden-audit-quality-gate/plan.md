# Plan

Task ID: `work-20260509-harden-audit-quality-gate`
Lane: `work`
Date: 2026-05-09

## Scope Boundary

Before `PLAN PASS`, do not probe server-67 live state, logs, schedulers, endpoints, worker reports, downstream runtime/config, or shared memory. After `PLAN PASS`, live validation is allowed because it is required by the task.

Execute only this intake card. Do not create and execute child implementation tasks during this run.

## Implementation Steps

1. Update `packages/shared/src/taskCompletionEvidence.ts`.
   - Add an issue code for insufficient substantive report evidence.
   - Detect exact report evidence markers: line references, symbol/function references tied to paths, command-output evidence, or structured findings with evidence/risk/verification fields.
   - Detect circular report evidence such as "this report exists", "task ran", "agent used tools", or "report was committed".
   - Add review-stage tool-activity counting for review/security/review-gate agents.
   - For risky completion, require committed report artifact, existing report path references, substantive report evidence, latest implementation tool activity, and latest review validation tool activity.

2. Update review-gate acceptance.
   - Extend `packages/agent/src/reviewGate.ts` input to know whether fallback success is allowed.
   - Make malformed/fallback `SUCCESS` fail closed for risky audit/review/discovery work.
   - Update `packages/agent/src/autoReviewHandler.ts` to pass task risk context into the gate.
   - Preserve existing non-risky fallback behavior.

3. Update tests.
   - Add shared completion-evidence tests for weak generic reports, circular reports, positive substantive reports, and missing review tool activity.
   - Add agent review-gate tests proving risky fallback `SUCCESS` does not accept and non-risky fallback `SUCCESS` still accepts.
   - Add/adjust coordinator or auto-review handler coverage for the risky auto-review accepted path.

4. Run local verification.
   - `npm.cmd test --workspace=@aif/shared -- --run src/__tests__/taskCompletionEvidence.test.ts`
   - `npm.cmd test --workspace=@aif/agent -- --run src/__tests__/reviewGate.test.ts src/__tests__/autoReviewHandler.test.ts src/__tests__/coordinator.test.ts`
   - `npm.cmd run build`
   - `npm.cmd run lint`
   - Broaden to `npm.cmd test` if focused tests/build/lint pass or if changes touch shared behavior in a way that warrants full regression.

5. After local verification, perform live server-67 validation.
   - Retire or quarantine the old weak canary output/card from the active validation surface.
   - Deploy the scoped code changes to server 67.
   - Run a negative quality canary that produces or attempts to approve a weak generic audit report like `audit/2026-05-09-aif-runtime-canary-audit.md`.
   - Verify the negative canary is rejected, blocked, or sent to rework rather than marked done.
   - Run a positive quality canary that produces a committed report with exact existing repository evidence and review-stage repository tool activity.
   - Verify the accepted report contains concrete file/line/function/symbol or command-output evidence that a human can inspect.

6. Close out RDPI.
   - Write `docs/rdpi/work/work-20260509-harden-audit-quality-gate/result.md` with local test results, live validation task ids, report paths, tool activity, rework/block evidence, final accepted quality evidence, and gate verdicts.
   - Run `$memsync MODE=auto LANE=work TASK_ID=work-20260509-harden-audit-quality-gate`.
   - Update only the matching entry in `docs/intake/work_status.json` after local memory review succeeds.

## Evidence Plan

- Local evidence: focused tests for the new quality guard, review fallback behavior, and coordinator transition behavior.
- Repository evidence: exact changed file paths and line-level references in the final result.
- Live evidence after `PLAN PASS`: server task ids, final statuses, report artifact paths, relevant tool activity excerpts, block/rework reason for the negative canary, and accepted report evidence for the positive canary.

## Required Gates

- Independent `PLAN PASS` before implementation.
- Independent `TEST PASS` after local and live verification.
- Independent `REVIEW PASS` after `TEST PASS`.

If any gate fails, revise the relevant artifacts or code and rerun the invalidated gate before continuing.
