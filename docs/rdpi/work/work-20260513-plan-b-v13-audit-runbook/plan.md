# Plan

## Implementation plan

1. Create `docs/ops/plan-b-v13-audit-runbook.md`.
2. Write the operator runbook using the design structure:
   - one-card versus decomposed-parent decision rules;
   - decomposed child report expectations;
   - reviewer unresolved-fact reporting guidance;
   - weak-plan rejection rules;
   - parent synthesis status rules;
   - blocked-card interpretation and retry procedures;
   - v13 prompt pack text or constraints;
   - cleanup/retry procedure for old v10/v11/v12 cards.
3. Keep claims deployment-neutral: describe the behavior and validation constraints without claiming a standalone "v13" rollout is deployed beyond completed implementation and regression task evidence.
4. Add source references to local code/docs so operators can trace the behavior without reading hidden runtime assumptions.
5. Leave the intake card unchanged.
6. After implementation, write `result.md` with gate outcomes, files changed, verification, and memory sync status.
7. Run `$memsync MODE=auto LANE=work TASK_ID=work-20260513-plan-b-v13-audit-runbook` through the repository tool after `PLAN PASS`, `TEST PASS`, and `REVIEW PASS`.
8. Update only the matching entry in `docs/intake/work_status.json` after successful local memory review.

## Acceptance criteria

- The runbook explains when to create one audit card versus a decomposed parent audit.
- The runbook defines what reviewers should report back to implementation as unresolved facts.
- The runbook explains how a blocked parent or child card should be interpreted and retried.
- The runbook records the v13 audit prompt text or prompt constraints used for validation.
- The runbook includes a cleanup/retry procedure for old v10/v11/v12 cards.
- Operator guidance is explicit and separate from hidden runtime assumptions.
- Documentation does not claim broad Plan B deployment beyond the local implementation and regression artifacts.

## Verification plan

- Run a documentation search to confirm all required topics exist:
  - `rg -n "One Card Or Decomposed Parent|Reviewer Unresolved Facts|Blocked Cards And Retry|V13 Prompt Pack|Cleanup For V10 V11 V12" docs/ops/plan-b-v13-audit-runbook.md`
- Run a source-reference search to confirm the runbook links to the relevant local contracts:
  - `rg -n "AUDIT_DECOMPOSITION_REQUIRED|stalled_rework_loop|no_substantive_rework_delta|synthesis_not_ready|manual_exception|source_inconclusive" docs/ops/plan-b-v13-audit-runbook.md`
- Run markdown sanity checks with available repository linting if it is cheap and scoped; on Windows PowerShell, use `npx.cmd prettier --check docs/ops/plan-b-v13-audit-runbook.md` so the check uses the batch shim instead of the blocked `npx.ps1` shim.
- Independent tester must return `TEST PASS` or `TEST FAIL`.
- Independent final reviewer must return `REVIEW PASS` or `REVIEW FAIL`.

## Reusable patterns

- For operator runbooks, prefer durable, visible procedures under `docs/ops/` with explicit source references and avoid relying on hidden runtime assumptions.
- For legacy audit cleanup, preserve historical cards and artifacts, then supersede them with traceable new audit parents instead of deleting old work.
