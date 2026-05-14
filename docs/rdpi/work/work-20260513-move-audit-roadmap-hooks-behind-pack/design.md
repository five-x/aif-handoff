# Design - Move Audit Roadmap Hooks Behind Workflow Pack

## Chosen Design

Add a narrow API-local roadmap workflow-pack extension layer keyed by the shared `TaskIntent`/`WorkflowPack` registry.

The shared registry remains the source of task-intent pack identity and generated-task validation. The API service adds a roadmap hook adapter for behavior that requires API/data dependencies, project root inspection, runtime prompt construction, and import side effects. This keeps dependency direction clean while satisfying the task requirement that audit roadmap behavior is pack-owned rather than embedded in generic roadmap flow.

The audit roadmap hooks should own:

- request guard behavior for audit-shaped aliases and audit-only vision text;
- audit generation context enrichment, including audit decomposition classification;
- audit generation prompt text;
- generated audit roadmap content normalization and deterministic fallback;
- deterministic audit roadmap extraction to generated task objects;
- audit generated-batch validation;
- import duplicate-alias rejection;
- audit import decoration for tags, review/subagent defaults, synthesis pause/block reason, artifact collection, and batch summary creation.

Generic roadmap generation/import remains responsible for:

- project lookup and project configuration reads;
- reading/writing `ROADMAP.md`;
- runtime model invocation for non-audit extraction/generation;
- zod parsing of model output;
- task creation, dedupe, plan path reservation, ordering, and return payload shape;
- route response mapping and websocket broadcasts.

Non-audit workflow packs should simply have no audit roadmap hook. Feature canary behavior remains typed but non-audit: it can use the existing typed prompt/extraction path and must not require audit report artifacts, risk hypotheses, diagnostic-only markers, synthesis outcomes, manifests, or report-only allowed changes.

## Pre-PLAN Boundary

Before `PLAN PASS`, this RDPI run may only record local static facts, task framing, design intent, risks, and proposed verification. It must not implement code changes, run runtime endpoint checks, inspect live workers/logs, or query shared memory.

## Decision Candidates

- Roadmap behavior that depends on API/data/project-root concerns should be behind an API-local workflow-pack extension, not forced into `@aif/shared`.
- The shared `WorkflowPack` registry remains the stable pack identity source; service-local extensions may use it to avoid making AIF Handoff an audit-only product.
- Audit roadmap strictness is preserved by calling existing validators and helpers through the hook boundary rather than reimplementing rules.

## Risks

- Error message compatibility is fragile because audit roadmap tests assert message fragments. Implementation should move call sites first and avoid changing validation text.
- Moving only one of the route or service alias guards would leave ownership split. Both should route through the same hook.
- Batch artifact creation is audit-specific persistence, but schema changes are out of scope. The hook should wrap existing `createRoadmapBatchContract` usage and preserve table names/types.
