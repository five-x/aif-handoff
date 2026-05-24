# Plan

## Implementation plan

1. Run independent plan review on `research.md`, `design.md`, and this `plan.md`; require explicit `PLAN PASS`.
2. After `PLAN PASS`, perform static source mapping with line references for:
   - `packages/shared/src/auditReportValidator.ts`
   - `packages/shared/src/auditSynthesisClassifier.ts`
   - `packages/shared/src/taskCompletionEvidence.ts`
   - `packages/data/src/index.ts`
   - `packages/agent/src/coordinator.ts`
   - `packages/agent/src/subagents/implementer.ts`
   - `packages/agent/src/subagents/reviewer.ts`
   - `packages/agent/src/reviewGate.ts`
3. Run focused verification commands or constructed examples that exercise downstream trust propagation without changing production code:
   - shared synthesis classifier tests focused on source-inconclusive and stale metadata behavior;
   - shared completion evidence tests focused on audit synthesis inconclusive behavior;
   - data tests focused on roadmap artifact trust, artifact rollups, and workflow timeline projections;
   - agent tests focused on deterministic synthesis, review handoff, and review gate handling.
4. If static or test evidence confirms a promotion path, create a separate queued implementation intake card and RDPI scaffold for that path only.
5. Write `result.md` with:
   - all mapped trust paths;
   - verification commands and outcomes;
   - fail-closed/promotion verdict table;
   - queued follow-up card references if needed;
   - gate outcomes.
6. Run independent tester gate. Required verdict: `TEST PASS` or `TEST FAIL`.
7. If tester passes, run independent final reviewer gate. Required verdict: `REVIEW PASS` or `REVIEW FAIL`.
8. After `TEST PASS` and `REVIEW PASS`, run:
   - `python "$env:USERPROFILE\.codex\tools\codex-memsync.py" --repo . --mode auto --lane work --task-id work-20260523-audit-synthesis-trust-propagation-review --project aif-handoff --entity aif-handoff`
9. If local memory review succeeds, update only the selected entry in `docs/intake/work_status.json` to `status: done`, `rdpiPath: docs/rdpi/work/work-20260523-audit-synthesis-trust-propagation-review`, and `updated: 2026-05-23`.

## Acceptance criteria

- All paths from source report validation to synthesis/API/timeline/review trust state are mapped with file/function references.
- Missing or stale `evidenceDepth` validation details are checked and shown to fail closed for no-findings trust, or a follow-up implementation card is queued.
- Ledger-backed source reports remain trusted only when original substantive evidence units are available and risk-bound, or a follow-up implementation card is queued.
- No production code changes are made by this diagnostic task.
- Any confirmed promotion path from shallow or inconclusive source evidence to trusted no-findings has a separate queued implementation task.
- `PLAN PASS`, `TEST PASS`, and `REVIEW PASS` are recorded before close-out.
- Memory sync local review succeeds before the intake task is marked `done`.

## Verification plan

- Planning gate:
  - independent reviewer reviews the task card plus `research.md`, `design.md`, and `plan.md`.
- Focused local commands after `PLAN PASS`:
  - `npm.cmd test --workspace=@aif/shared -- auditSynthesisClassifier taskCompletionEvidence auditReportValidator`
  - `npm.cmd test --workspace=@aif/data -- index workflowTimeline`
  - `npm.cmd test --workspace=@aif/agent -- reviewer reviewGate coordinator implementer`
  - `npm.cmd run lint`
  - `npm.cmd run build`
  - `git diff --check`
- Constructed examples may use temporary files outside the repo or inline `tsx` snippets only if existing tests do not directly cover a mapped trust path. Any such examples must be recorded in `result.md` with exact command and observed output.
- Independent tester verifies the mapped evidence, commands, no-production-code constraint, and any follow-up cards.
- Independent final reviewer verifies the diagnostic verdict and close-out truthfulness.

## Reusable patterns

- For audit trust propagation, treat public outcomes as labels only. Trusted no-findings also requires valid source identity, current source snapshot, substantive scope coverage, risk-bound evidence, and `evidenceDepth.trustedNoFindingsSupported === true`.
