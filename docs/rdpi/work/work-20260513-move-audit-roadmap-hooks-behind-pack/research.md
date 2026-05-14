# Research - Move Audit Roadmap Hooks Behind Workflow Pack

## Task Framing And Lane

- Task ID: `work-20260513-move-audit-roadmap-hooks-behind-pack`.
- Lane: `work`.
- Intake card: `docs/intake/work/work-20260513-move-audit-roadmap-hooks-behind-pack.md`.
- RDPI path: `docs/rdpi/work/work-20260513-move-audit-roadmap-hooks-behind-pack`.
- Request: move audit roadmap generation and import behavior behind audit workflow-pack optional hooks, preserve current audit strictness and diagnostics, keep non-audit workflow packs free from audit-only roadmap requirements, and document the ownership boundary.
- Explicit exclusions: no database schema work, generic artifact persistence, audit evidence ledger rename, UI/API timeline work, finance/analytics pack implementation, or live runtime probing before `PLAN PASS`.

## Accepted Planning Sources Or Local Facts

- `AGENTS.md` requires RDPI for non-trivial work, local repo facts before memory, independent `PLAN PASS`, `TEST PASS`, and `REVIEW PASS`, and no live evidence collection before `PLAN PASS`.
- `python "$env:USERPROFILE\.codex\tools\codex-ensure-rdpi.py"` returned `STATUS: ready`.
- `python "$env:USERPROFILE\.codex\tools\codex-flow-audit.py" --repo .` returned `STATUS: clean`.
- Predecessor dependency `work-20260513-implement-workflow-pack-registry-feature-canary` has `PLAN PASS`, `TEST PASS`, and `REVIEW PASS` in `docs/rdpi/work/work-20260513-implement-workflow-pack-registry-feature-canary/result.md`.
- Current shared registry exists in `packages/shared/src/workflowPacks.ts`. `WorkflowPack` currently owns `id`, `label`, `taskContract`, and `validateGeneratedTask`; the audit pack delegates generated-card validation to `validateGeneratedAuditCard`.
- Current public task-intent API in `packages/shared/src/taskIntent.ts` delegates `validateGeneratedTaskIntent` to `validateGeneratedWorkflowTask`.
- Parent design `docs/rdpi/work/work-20260513-define-workflow-contract-pack-interface/design.md` explicitly sketched optional `roadmap` hooks and named audit roadmap source validation, deterministic fallback, and synthesis validation as audit pack behavior.
- `packages/api/src/services/roadmapGeneration.ts` still owns audit roadmap behavior directly:
  - audit-shaped alias and audit-only vision detection;
  - audit decomposition classification;
  - audit generation prompt text;
  - generated audit roadmap source validation;
  - prior inconclusive audit context injection;
  - deterministic audit roadmap fallback and deterministic audit roadmap-to-task conversion;
  - generated batch validation and audit-specific validation error prefix;
  - audit import defaults, tags, synthesis pause/blocking, artifact collection, and roadmap batch creation.
- `packages/api/src/routes/projects.ts` also has a route-level audit alias reuse guard, currently keyed directly on `taskIntent === "audit"`.
- `packages/api/src/__tests__/roadmapGeneration.test.ts` has focused coverage for audit generation prompts, deterministic fallback, audit source roadmap rejection before model extraction, deterministic audit conversion, audit import defaults, reused audit aliases, and typed feature import behavior.
- `packages/shared/src/__tests__/taskIntent.test.ts` covers the workflow pack registry and proves feature tasks do not inherit audit-only markers.
- The worktree already contains predecessor changes and memory artifacts. This task should build on the predecessor files and avoid reverting unrelated changes.

## Same-Project Memory

Shared memory was not queried before `PLAN PASS` because the RDPI contract for this task forbids shared-memory recall before the plan gate unless explicitly waived. Local predecessor RDPI artifacts and local KB docs were sufficient for planning.

## Cross-Project Reusable Patterns

No cross-project memory was queried before `PLAN PASS` for the same boundary reason. The reusable local pattern is the accepted workflow pack split: core orchestration remains generic, while pack-owned hooks carry workflow-specific validation semantics.

## Rejected Or Stale Memory Candidates

- No memory candidates were evaluated or rejected before `PLAN PASS`.
- After implementation, memsync should publish only curated non-secret conclusions from the completed task.

## Open Questions

- Whether to extend the shared `WorkflowPack` interface with full roadmap hook types now, or use a narrow API-local roadmap hook registry keyed by shared `WorkflowPack.id`. Current evidence favors the API-local hook registry because roadmap import side effects depend on API/data modules and project filesystem state that cannot live in `@aif/shared`.
- Whether to remove all route-level `taskIntent === "audit"` checks in this slice or only route them through the roadmap hook lookup. Current evidence favors routing the existing alias reuse guard through the hook lookup while preserving the route shape.

## Hypotheses

- A narrow API-local `roadmapWorkflowPacks` extension can route audit roadmap generation and import validation through audit-owned hooks without moving database or filesystem side effects into `@aif/shared`.
- Non-audit packs can omit roadmap hooks and keep the current generic/typed roadmap extraction path unchanged.
- Existing audit diagnostics can remain compatible if the hook adapter calls the existing helper logic rather than rewriting validation rules.
- Focused API tests plus shared registry tests should catch regressions in audit strictness and the feature canary boundary.
