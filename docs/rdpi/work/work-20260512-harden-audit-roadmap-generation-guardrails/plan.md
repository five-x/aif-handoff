# Plan: Harden Audit Roadmap Generation Guardrails

Task: `work-20260512-harden-audit-roadmap-generation-guardrails`

## Implementation Steps

1. Add canonical audit guardrail constants and validation issue codes in `packages/shared/src/auditRoadmapContract.ts`.
2. Extend `validateGeneratedAuditCard` to require report no-findings proof exclusions and synthesis outcome requirements.
3. Update `packages/shared/src/__tests__/auditRoadmapContract.test.ts` for the new shared contract and a missing-guardrail failure.
4. Update `packages/api/src/services/roadmapGeneration.ts` to use the shared constants in deterministic audit cards and prompt templates.
5. Add generic prior-inconclusive-audit context extraction and preservation for generated/fallback audit cards.
6. Extend audit source and generated batch validation so missing canonical guardrails or missing preserved prior-inconclusive context rejects before import.
7. Update `packages/api/src/__tests__/roadmapGeneration.test.ts` helpers and add a v8-like regression fixture covering context preservation, report no-findings proof language, synthesis outcome language, source validation, and direct import validation.
8. Run targeted checks:
   - `npm.cmd test --workspace=@aif/shared -- src/__tests__/auditRoadmapContract.test.ts src/__tests__/taskIntent.test.ts`
   - `npm.cmd test --workspace=@aif/api -- src/__tests__/roadmapGeneration.test.ts`
   - `npm.cmd run build --workspace=@aif/shared`
   - `npm.cmd run build --workspace=@aif/api`
   - `git diff --check`
9. Run independent TEST and REVIEW gates. If either fails, revise and rerun the invalidated gate.
10. Run local memory review/sync per `runtask` close-out and then update only this task's status entry.

## Acceptance Evidence

- Generated report card descriptions explicitly reject inventory-only proof, including `git ls-files`, `git status`, directory listings, and file-existence checks, for no-findings conclusions.
- Generated synthesis descriptions include the three required audit outcomes.
- V8-like prior-inconclusive context is preserved in report and synthesis descriptions without project-specific hardcoding.
- Audit import validation rejects structurally valid but substantively weak audit text.
- Existing typed audit metadata, report artifact creation, synthesis pause, and dedupe behavior remain covered by existing tests.

## Rollback

Revert the shared guardrail constants/validation changes, API roadmap-generation text/validation changes, and matching tests. Rollback restores weaker audit-card acceptance and should only be used if the new contract blocks valid diagnostic audit roadmaps that already carry equivalent substantive evidence requirements.
