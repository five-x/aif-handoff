# Plan - Move Audit Roadmap Hooks Behind Workflow Pack

## Implementation Plan

1. Add an API-local roadmap workflow pack extension in `packages/api/src/services/roadmapWorkflowPacks.ts`.
   - Key hooks by `TaskIntent`.
   - Resolve hooks through shared `getWorkflowPack(intent)` so the API extension is anchored to the workflow pack registry.
   - Keep API/data side-effect types local to the API service.

2. Move audit roadmap-owned behavior behind the audit extension.
   - Route audit-shaped request guards through the hook.
   - Route audit generation prompt construction and generated content normalization through the hook.
   - Route deterministic audit roadmap-to-task conversion through the hook.
   - Route audit batch validation through the hook.
   - Route audit alias reuse, import decoration, artifact collection, synthesis blocking, and batch summary creation through the hook.

3. Refactor `packages/api/src/services/roadmapGeneration.ts` to ask the resolved roadmap extension before falling back to generic behavior.
   - Preserve current function signatures and public exports.
   - Preserve existing error codes, message fragments, task defaults, tags, and batch summary payload shape.
   - Keep generic and typed non-audit flows on their existing model extraction path.

4. Update `packages/api/src/routes/projects.ts`.
   - Replace the hard-coded audit alias reuse helper with hook-based request guard behavior.
   - Preserve HTTP status mapping and response shape.

5. Add or update focused tests.
   - Assert audit generation/import goes through the hook boundary without weakening current diagnostics.
   - Assert audit-shaped aliases still require explicit audit intent and reused audit aliases still fail before partial imports.
   - Assert feature typed roadmap imports remain non-audit and are not rejected for missing audit-only fields.

6. Update documentation.
   - Extend `docs/kb/workflow-contract-pack-registry.md` with the roadmap hook ownership boundary and the API-local extension rationale.

7. Run verification and gates.
   - Run focused shared and API tests.
   - Run package build/lint checks appropriate to touched packages.
   - Require independent `TEST PASS` and `REVIEW PASS`.
   - Run memsync auto after `REVIEW PASS`.
   - Update only the matching `docs/intake/work_status.json` entry after local memory review succeeds.

## Acceptance Criteria

- Audit roadmap generation/import code delegates audit-owned behavior through workflow-pack keyed hooks or the narrow API-local equivalent.
- Current audit roadmap behavior, strictness, failure classifications, message fragments, generated defaults, and batch summaries remain compatible.
- Feature canary behavior remains non-audit and is not rejected for missing audit roadmap fields.
- No database schema, generic artifact persistence, evidence ledger rename, UI/API timeline work, finance pack, analytics pack, or real non-audit pack beyond the existing feature canary is introduced.
- RDPI `PLAN PASS`, `TEST PASS`, and `REVIEW PASS` are recorded before close-out.

## Verification Plan

- `npm.cmd test --workspace=@aif/shared -- --run src/__tests__/taskIntent.test.ts src/__tests__/auditRoadmapContract.test.ts`
- `npm.cmd test --workspace=@aif/api -- --run src/__tests__/roadmapGeneration.test.ts src/__tests__/projects.test.ts`
- `npm.cmd run build --workspace=@aif/shared`
- `npm.cmd run build --workspace=@aif/api`
- `npm.cmd run lint --workspace=@aif/shared`
- `npm.cmd run lint --workspace=@aif/api`
- `git diff --check`

## Reusable Patterns

- Keep dependency-heavy workflow behavior in the package that already owns those dependencies, but key it by shared workflow-pack identity so pack semantics are explicit and testable.
- Preserve compatibility by moving existing validators behind an extension boundary before changing behavior.
