# Result: Reject Weak Audit Plans In Plan Checker

## Summary

Implemented audit-specific plan-quality hardening in the plan-checker path.

Audit and diagnostic plans now fail before implementation unless they declare concrete scoped evidence targets, explicit exclusions, expected report structure, and a child/source report decision. Broad audit plans must declare decomposition with child/source reports plus synthesis, and marker-only plans no longer pass by naming only generic audit concepts or the final synthesis artifact.

## Changes

- Extended `packages/shared/src/planQuality.ts` with audit-only issue codes and checks for:
  - scoped evidence targets;
  - concrete non-report audit boundaries;
  - explicit excluded areas or out-of-scope boundaries;
  - expected report fields;
  - child/source report decisions;
  - broad audit decomposition requirements.
- Reused `classifyAuditDecompositionRequest()` so oversized broad audits fail unless the plan is explicitly decomposed.
- Tightened deterministic diagnostic fallback:
  - it requires concrete source boundaries from task text;
  - it does not pass report-only audit tasks;
  - it does not pass broad decomposition-required audit tasks.
- Added regression coverage in `packages/shared/src/__tests__/planQuality.test.ts`.
- Added plan-checker integration coverage in `packages/agent/src/__tests__/planChecker.test.ts`.

## Gate outcomes

- `PLAN PASS`: independent plan review accepted the RDPI plan before implementation.
- `TEST PASS`: independent tester reran focused verification after the final synthesis-exception fix.
- `REVIEW PASS`: independent final reviewer accepted the revised patch after confirming prior blockers were fixed.

Earlier final review gates returned `REVIEW FAIL` for real edge cases:

- marker-only evidence targets could pass without concrete source boundaries;
- deterministic fallback could manufacture a passing weak plan from only a report artifact;
- decomposed audit plans could pass without concrete source roots;
- empty `Excluded areas:` could be misread as present;
- the synthesis-only exception could treat the final synthesis output path as evidence.

Each blocker was fixed and rerun through invalidated test/review gates before close-out.

## Verification

- `npm.cmd test --workspace @aif/shared -- planQuality`
  - Passed.
  - Vitest reported 1 test file passed and 33 tests passed.
- `npm.cmd test --workspace @aif/agent -- planChecker`
  - Passed.
  - Vitest reported 1 test file passed and 28 tests passed.

The agent-focused test emitted existing localhost broadcast warnings, but no test failed.

## Memory sync

- `python "$env:USERPROFILE\.codex\tools\codex-memsync.py" --repo . --mode auto --lane work --task-id work-20260513-reject-weak-audit-plans-in-plan-checker --project aif-handoff --entity aif-handoff` completed local memory review artifact generation.
- Sync status: `skipped`.
- Reason: no publishable curated documents.
- Report: `docs/memory/reports/work-20260513-reject-weak-audit-plans-in-plan-checker-memsync-report.md`.
- Generated local review artifacts:
  - `docs/memory/tasks/work/work-20260513-reject-weak-audit-plans-in-plan-checker-delta.md`
  - `docs/memory/tasks/work/work-20260513-reject-weak-audit-plans-in-plan-checker-hypotheses.md`
  - `docs/memory/projects/aif-handoff/capsule.md`
  - `docs/memory/entities/aif-handoff/capsule.md`
