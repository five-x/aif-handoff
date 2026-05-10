# Research

## Task framing and lane

- Task ID: `work-20260510-harden-typed-roadmap-content-validation`
- Lane: `work`
- Selected by explicit user request through `$runtask`.
- Intake card: `docs/intake/work/work-20260510-harden-typed-roadmap-content-validation.md`
- RDPI path: `docs/rdpi/work/work-20260510-harden-typed-roadmap-content-validation/`
- User has now explicitly requested execution; the intake card's original "intake only" wording is treated as superseded by the `$runtask` command.

## Accepted planning sources

- `docs/intake/work/work-20260510-harden-typed-roadmap-content-validation.md`
- `AGENTS.md` and the supplied global/project task-routing and RDPI rules.
- Required preflight results:
  - `codex-ensure-rdpi.py`: `STATUS: refreshed`
  - `codex-flow-audit.py --repo .`: `STATUS: clean`
- Local source files inspected before `PLAN PASS`:
  - `packages/api/src/services/roadmapGeneration.ts`
  - `packages/api/src/__tests__/roadmapGeneration.test.ts`
  - `packages/api/src/routes/projects.ts`
  - `packages/api/src/schemas.ts`
  - `packages/shared/src/taskIntent.ts`
  - `packages/web/src/components/layout/RoadmapDialog.tsx`

## Current implementation facts

- `generateRoadmapFile()` writes `.ai-factory/ROADMAP.md` from model output without validating audit roadmap content before writing or before later extraction.
- `generateRoadmapTasks()` parses model JSON and calls `validateRoadmapTasks()` after extraction.
- `validateRoadmapTasks()` validates generated task descriptions through `validateGeneratedTaskIntent()`, but it does not validate the source `ROADMAP.md` content before extraction.
- `validateGeneratedTaskIntent()` currently checks audit descriptions for required markers and catches titles that start with implementation verbs unless diagnostic words are present.
- The current audit title check can be bypassed by titles such as `Audit: Critical Bug Resolution` because the implementation-shaped phrase is not at the start of the title.
- The current audit description check accepts `Allowed changes: None` as long as the marker exists, even though audit cards must be allowed to create or update a named report artifact.
- `importGeneratedTasks()` validates inside the creation loop. If a typed batch has a valid first new task and an invalid later new task, the earlier task can be created before the error is thrown.
- `projects.ts` already returns `RoadmapGenerationError.message` through the synchronous import API and broadcasts it through `roadmap:error` for async generation; `RoadmapDialog.tsx` displays those messages.

## Same-project memory

- Not queried before `PLAN PASS` because the intake card and RDPI contract prohibit shared-memory recall before the plan gate unless explicitly waived.
- Local `docs/memory/**` artifacts may be considered after implementation only for memory-review/memsync close-out.

## Cross-project reusable patterns

- No cross-project memory was queried before `PLAN PASS`.
- Reusable local pattern: prior roadmap generation tests keep typed-looking aliases generic unless `taskIntent` is explicit. This must remain true.

## Open questions

- Whether to export audit validation helpers for direct unit tests or keep coverage through public `generateRoadmapFile()`, `generateRoadmapTasks()`, and `importGeneratedTasks()` APIs. Preferred: keep helpers private unless tests need direct access.
- Whether source roadmap validation should require every audit item title to start with `Audit:`. Preferred: require diagnostic shape, not a specific prefix, because the intake says a prefix must not mask implementation work but does not require a prefix.

## Hypotheses

- A deterministic validation layer can satisfy the task without modifying runtime prompts beyond possibly tightening error wording.
- Validating audit source roadmap content before extraction will catch bad generated `ROADMAP.md` files and bad existing import files before agent extraction can normalize them into apparently valid tasks.
- Moving batch validation before creation in `importGeneratedTasks()` will make typed imports atomic with respect to validation failures while preserving duplicate skipping behavior.
