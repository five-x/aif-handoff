# Design

## Chosen design

Add deterministic audit validation in `packages/api/src/services/roadmapGeneration.ts` and keep it close to the roadmap generation/import boundary:

- Introduce audit-specific validators for source `ROADMAP.md` content and generated task card content.
- Validate audit `ROADMAP.md` content in two places:
  - after `generateRoadmapFile()` resolves the content and before writing/returning it
  - at the start of `generateRoadmapTasks()` before building the extraction prompt
- Tighten generated-card validation for `taskIntent: audit` so it:
  - rejects implementation-shaped titles/descriptions even when prefixed with `Audit:`
  - rejects `Allowed changes: None`
  - requires allowed changes to be report-artifact-only
  - requires a report artifact path
  - keeps existing evidence/risk/verification/git/report markers
- Validate typed import batches before creating any tasks:
  - compute ordered tasks
  - validate every generated task before duplicate skipping or calling `createTask()`
  - for audit batches, enforce exactly one final synthesis generated task before duplicate skipping or calling `createTask()`
  - apply duplicate skipping only after the entire batch passes validation
  - only create tasks after the full batch passes validation
- Preserve generic roadmap behavior by applying the stricter audit source/content validators only when the explicit requested or batch `taskIntent` is `audit`.
- Surface actionable errors by throwing `RoadmapGenerationError` messages that include: `Audit roadmap generation produced implementation-shaped milestones; no tasks imported.`

## Source roadmap validation shape

For explicit audit intent, reject source roadmaps when:

- unchecked items include implementation-shaped language such as fixing, resolving, implementing, refactoring, hardening, expanding tests, deploying, or documentation work, unless the item is explicitly diagnostic/reporting framed
- required diagnostic markers are missing: report artifact, allowed changes, diagnostic-only constraint, evidence requirements, risk, verification, git status, git commit, and git log verification
- there is not exactly one final synthesis unchecked item
- unchecked audit task items do not name a report artifact path
- generated audit output uses contradictory `Allowed changes: None`

Audit generated-batch validation will mirror the source-level synthesis rule: exactly one generated task must be a final synthesis/report-summary card. This protects against extraction responses that drop the synthesis card or duplicate it after the source roadmap passed validation.

The implementation-shaped term check will use deterministic regexes over titles and descriptions, with exception handling for phrases like "audit security hardening risk" or "report findings about architecture refactoring" where the work is clearly diagnostic.

## Pre-PLAN boundary

Before `PLAN PASS`, only local source inspection and RDPI planning artifacts are allowed. No live server checks, live roadmap generation, runtime profile mutation, scheduler/log probing, or shared-memory recall has been performed.

## Decision candidates

- Deterministic typed-intent validation belongs at both generation/import boundaries, not only in prompts.
- Batch imports should validate all new tasks before any create side effects.
