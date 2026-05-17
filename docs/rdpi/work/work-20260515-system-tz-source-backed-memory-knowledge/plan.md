# Plan: System TZ Source Backed Memory Knowledge

## Gate status

- `PLAN PASS`: passed by independent reviewer.
- `TEST PASS`: pending implementation and independent tester verdict.
- `REVIEW PASS`: pending implementation and independent reviewer verdict.

## Implementation steps

1. Extend shared memory contracts.
   - Add memory item type constants and `MemoryItemType`.
   - Add memory claim status/source DTOs and `MemoryClaim`.
   - Add memory failure-family constants.
   - Add `type`, `failureFamily`, and `claims` to `MemoryItem`, create input, and update input.
   - Re-export browser/server shared types.

2. Extend SQLite schema and migrations.
   - Add `item_type`, `failure_family`, and `claims_json` to fresh `memory_items` creation.
   - Add trailing migration after the current latest DB version.
   - Add indexes for item type/failure family if useful for review/retrieval filters.
   - Update schema tests to verify fresh and migrated memory columns.

3. Update data-layer memory behavior.
   - Normalize and sanitize claim JSON, source refs, failure family, and item type.
   - Generate a default source-backed claim for task-sourced verified-task candidates.
   - Include claims/source fields in redaction evaluation.
   - Reject approval when redaction is blocked or no valid claim source exists.
   - Stamp missing `lastValidatedAt` when claims are approved.
   - Include source-backed claim details in `formatMemoryContextForPrompt` while preserving bounded, non-overriding brief text and existing usage-event recording.

4. Update API validation and route behavior.
   - Accept `type`, `failureFamily`, and `claims` in create/update schemas.
   - Return the new fields through existing memory routes.
   - Add API tests for source-backed approval success and sourceless approval rejection.

5. Update web review UI.
   - Show item type, failure family, source task/ref, claims, and task/artifact/evidence/code source links in `MemoryDialog`.
   - Keep the existing redaction-blocked approval disablement.
   - Add or update focused UI test coverage if the current component tests can exercise the new rendering cheaply.

6. Update docs.
   - Refresh memory sections in `docs/api.md` and `docs/architecture.md`.
   - Update `docs/configuration.md` memory wording only if the existing env description becomes stale.

## Verification plan

- `npm.cmd run test --workspace=@aif/shared -- src/__tests__/db.test.ts`
- `npm.cmd run test --workspace=@aif/data -- src/__tests__/index.test.ts`
- `npm.cmd run test --workspace=@aif/api -- src/__tests__/memory.test.ts`
- `npm.cmd run test --workspace=@aif/web -- src/__tests__/MemoryDialog.test.tsx`
- `npm.cmd run lint --workspace=@aif/shared`
- `npm.cmd run lint --workspace=@aif/data`
- `npm.cmd run lint --workspace=@aif/api`
- `npm.cmd run lint --workspace=@aif/web`
- `npm.cmd run build --workspace=@aif/shared`
- `npm.cmd run build --workspace=@aif/data`
- `npm.cmd run build --workspace=@aif/api`
- `npm.cmd run build --workspace=@aif/agent`
- `npm.cmd run build --workspace=@aif/web`
- Focused lint for touched packages if build/test output indicates lint-sensitive changes, or full package lints if time allows.

## Completion criteria

- All intake `Done When` bullets are represented in code, tests, and docs.
- No filesystem knowledge source of truth is introduced.
- Existing role injection paths still record `memory_usage_events`.
- Independent tester returns `TEST PASS`.
- Independent final reviewer returns `REVIEW PASS`.
- `docs/rdpi/work/work-20260515-system-tz-source-backed-memory-knowledge/result.md` records gate outcomes and verification.
- `$memsync MODE=auto LANE=work TASK_ID=work-20260515-system-tz-source-backed-memory-knowledge` completes local review artifacts successfully before task status is marked done.
