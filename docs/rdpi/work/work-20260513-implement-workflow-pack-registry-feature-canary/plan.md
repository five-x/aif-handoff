# Plan - Implement Workflow Pack Registry And Feature Canary

## Implementation plan

1. Add `packages/shared/src/workflowPacks.ts`.
   - Define `WorkflowPack`.
   - Register every current `TaskIntent` in `WORKFLOW_PACKS`.
   - Implement `getWorkflowPack(intent)` and `validateGeneratedWorkflowTask(input)`.
   - Preserve title-required validation at the shared registry entry point.

2. Move generated task validation routing behind the registry.
   - Update `packages/shared/src/taskIntent.ts` to remove its direct audit-validator import.
   - Keep `validateGeneratedTaskIntent(input)` as the stable public API and delegate to `validateGeneratedWorkflowTask(input)`.
   - Avoid changing `TASK_INTENT_CONTRACTS`, inference, prompt formatting, or defaults.

3. Export the narrow registry surface.
   - Export `WORKFLOW_PACKS`, `getWorkflowPack`, `validateGeneratedWorkflowTask`, and `WorkflowPack` from `packages/shared/src/index.ts`.
   - Mirror the same narrow exports from `packages/shared/src/browser.ts` if that bundle currently re-exports task-intent APIs.

4. Expand focused shared tests.
   - Keep existing audit compatibility assertions in `packages/shared/src/__tests__/taskIntent.test.ts`.
   - Add assertions that audit validation is routed through the audit pack and still emits existing strict audit messages.
   - Add feature canary assertions for a complete non-audit feature card with `Acceptance criteria:`, `Verification:`, `Dependencies:`, `Scope:`, `Evidence requirements:`, and source/test/docs `Allowed changes:`.
   - Assert the feature canary is not rejected for missing audit-only markers such as report artifact, risk hypotheses, diagnostic-only, audit manifest, synthesis outcome, or report-only allowed changes.
   - Assert `getWorkflowPack("feature")` returns the feature pack and `getWorkflowPack("audit")` returns the audit pack.

5. Add a local KB note.
   - Create `docs/kb/workflow-contract-pack-registry.md`.
   - Document the registry boundary, audit adapter, feature canary, how future packs register generated-task validation behavior, and current out-of-scope boundaries.

6. Complete close-out artifacts.
   - After implementation and verification, write `result.md`.
   - Run local memory review with `codex-memsync.py --mode auto` for this task.
   - Mark only this task done in `docs/intake/work_status.json` after local memory review succeeds.

## Acceptance criteria

- Shared code has a typed workflow pack registry.
- `validateGeneratedTaskIntent` routes through the registry without changing its public import path.
- Audit generated-task validation remains strict and message-compatible with current tests.
- The feature canary proves a non-audit generated task can pass the same registry without audit-only roadmap/report semantics.
- New registry exports are narrow and shared-package-only.
- A local KB note explains how future workflow packs register validation behavior.
- No schema, persistence, scheduler, UI, or API timeline behavior changes are introduced.

## Verification plan

- Independent plan gate: required `PLAN PASS` before implementation.
- Focused shared tests:
  - `npm.cmd test --workspace=@aif/shared -- --run src/__tests__/taskIntent.test.ts`
- Shared package build:
  - `npm.cmd run build --workspace=@aif/shared`
- Shared package lint:
  - `npm.cmd run lint --workspace=@aif/shared`
- Diff hygiene:
  - `git diff --check`
- Independent `TEST PASS` after local verification.
- Independent `REVIEW PASS` after implementation.

## Reusable patterns

- Keep public task-intent APIs stable while moving ownership behind a new internal registry.
- Use adapter delegation for a strict workflow pack migration before rewriting validators.
- Add a non-audit canary whenever generalizing audit-specific infrastructure.
