# Design - Implement Workflow Pack Registry And Feature Canary

## Chosen design

Add a small shared `workflowPacks.ts` module that owns task-intent validation routing.

The module will define:

- `WorkflowPack` with `id`, `label`, `taskContract`, and `validateGeneratedTask`.
- `WORKFLOW_PACKS` keyed by every current `TaskIntent`.
- `getWorkflowPack(intent)` for pack lookup.
- `validateGeneratedWorkflowTask(input)` as the registry entry point for generated task validation.

The audit pack will be a strict adapter over `validateGeneratedAuditCard`. It must not change audit issue messages, diagnostic marker requirements, report-only allowed changes, synthesis/source behavior, or task title rejection rules.

The feature pack will preserve the current feature validation semantics: generated feature cards must include `Acceptance criteria:` and `Verification:`. Focused tests will expand the canary so a feature card with dependencies, scope, evidence requirements, and source/test/docs allowed changes passes without audit-only markers.

Other packs will use the current per-intent checks from `validateGeneratedTaskIntent` as direct pack-owned validators. This avoids introducing a partial registry with hidden fallbacks and keeps the change easy to review.

`taskIntent.ts` will continue owning task intent vocabulary, contracts, default resolution, prompt formatting, and intent inference. Its `validateGeneratedTaskIntent` export will delegate to `validateGeneratedWorkflowTask` so existing consumers keep their import path.

## Pre-PLAN boundary

Before `PLAN PASS`, work is limited to local source reading, RDPI artifact preparation, and planning.

No implementation edits, runtime/service probing, scheduler inspection, endpoint checks, log inspection, memory recall, or downstream runtime/config reads are authorized before the independent plan gate passes.

## Boundaries and non-goals

- No database schema, persistence model, scheduler, UI, or API timeline behavior changes.
- No audit roadmap generation/import optional hooks.
- No audit evidence ledger renaming or generic artifact/claim persistence.
- No finance, analytics, or real workflow packs beyond the feature canary.
- No weakening of current audit validation strictness.
- No broad refactor of task intent defaults or planner prompt formatting.

## Decision candidates

- Workflow pack registration belongs in shared code so API, agent, browser bundle, and future pack-aware consumers use the same contract.
- Task intent contracts remain the source of defaults. Packs reference those contracts rather than duplicating default policy.
- Audit semantics stay pack-owned, but the first implementation slice uses adapter delegation rather than rewriting audit validators.
