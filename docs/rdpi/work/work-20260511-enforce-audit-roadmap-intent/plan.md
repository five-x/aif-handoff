# Plan: Enforce Audit Roadmap Intent

Task: `work-20260511-enforce-audit-roadmap-intent`

## Scope

Change the roadmap generation/import contract so audit-shaped requests cannot be accepted as generic roadmaps.

## Steps

1. Add audit-shaped request detection and a fail-closed helper in `packages/api/src/services/roadmapGeneration.ts`.
2. Use the helper in `generateRoadmapFile`, `generateRoadmapTasks`, and `importGeneratedTasks`.
3. Use the same helper in `packages/api/src/routes/projects.ts` before starting background generation or import.
4. Add route tests in `packages/api/src/__tests__/projects.test.ts`.
5. Add service tests in `packages/api/src/__tests__/roadmapGeneration.test.ts`.
6. Add explicit regression coverage that audit-only vision fails closed even when the alias is not audit-shaped.
7. Add explicit non-regression coverage that `audit-logging` with `add audit logging` remains generic.
8. Run targeted tests for roadmap generation and project routes.
9. Run `npm.cmd test`, `npm.cmd run lint`, and `npm.cmd run build` if targeted tests pass.

## Verification

Minimum verification:

- `npm.cmd --workspace @aif/api test -- src/__tests__/roadmapGeneration.test.ts src/__tests__/projects.test.ts`
- `npm.cmd test`
- `npm.cmd run lint`
- `npm.cmd run build`

Expected evidence:

- audit run alias `audit-v6` with omitted or explicit general intent returns/rejects `ROADMAP_INTENT_MISMATCH`
- audit-only vision such as `diagnostic audit only; do not fix code` returns/rejects `ROADMAP_INTENT_MISMATCH`
- Russian audit-only phrases represented with Unicode escapes return/reject `ROADMAP_INTENT_MISMATCH`
- generic alias `audit-logging` remains generic without explicit intent
- generic alias `audit-logging` with vision `add audit logging` remains generic without explicit intent
- explicit `taskIntent: "audit"` still reaches deterministic audit roadmap behavior

## Rollback

Revert the helper, route guard, and tests. The rollback restores previous fail-open behavior, so it should only be used if the guard blocks valid non-audit roadmaps.

## PLAN Gate Request

The plan is ready for independent review. Required verdict: `PLAN PASS` or `PLAN FAIL`.
