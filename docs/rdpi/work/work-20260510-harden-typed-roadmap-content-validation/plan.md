# Plan

## Implementation plan

1. Add private audit validation helpers in `packages/api/src/services/roadmapGeneration.ts`:
   - source roadmap item extraction for unchecked `- [ ]` items and indented detail lines
   - implementation-shaped language detection with diagnostic/reporting exceptions
   - audit source marker validation
   - audit generated-card validation for allowed changes/report artifact/content shape
2. Wire source validation into `generateRoadmapFile()` and `generateRoadmapTasks()` for explicit `taskIntent: audit`.
3. Tighten `validateGeneratedTaskIntent()` in `packages/shared/src/taskIntent.ts` for audit generated cards, or keep audit-specific card validation in the API service if it needs roadmap-specific error wording.
4. Refactor `importGeneratedTasks()` so typed batch validation completes before any duplicate skipping or `createTask()` calls:
   - validate every generated task, including duplicates
   - for audit batches, enforce exactly one final synthesis generated task
   - apply duplicate skipping and task creation only after the full batch passes validation
5. Add focused tests in `packages/api/src/__tests__/roadmapGeneration.test.ts` for:
   - bad audit generated roadmap terms: `Critical Bug Resolution`, `Architecture Refactoring`, `Security Hardening`, `Test Suite Expansion`
   - `Allowed changes: None`
   - prefix masking, such as `Audit: Critical Bug Resolution`
   - missing source roadmap requirements and missing/extra synthesis item
   - missing and extra synthesis in the generated/imported audit task batch
   - no partial task creation when a later generated task in a typed batch is invalid
   - no partial task creation when an invalid duplicate appears before a valid new task
   - generic roadmap behavior unchanged for `general` intent and typed-looking aliases
6. Record the completed validation rules, test commands, and migration notes in `result.md`.
7. Run local memory review/memsync artifact preparation after implementation and tests, then update only this task entry in `docs/intake/work_status.json`.

## Acceptance criteria

- Explicit audit roadmap generation fails closed if model output includes implementation-shaped audit milestones.
- Explicit audit existing-roadmap import validates source `ROADMAP.md` before extraction.
- Audit source validation requires report artifacts, diagnostic-only constraints, evidence/risk/verification requirements, git commit verification, and exactly one final synthesis card.
- Audit generated-card validation rejects `Allowed changes: None` and only permits creating/updating the named report artifact.
- `Audit:` prefixes cannot mask implementation-shaped titles or descriptions.
- `importGeneratedTasks()` creates no tasks from a typed batch when any generated task in that batch is invalid, including duplicates.
- Audit generated/imported task batches must contain exactly one final synthesis card.
- API and UI receive/display actionable `RoadmapGenerationError` messages through existing response/broadcast paths.
- Generic `general` roadmap behavior remains available and typed-looking aliases are not treated as typed intent unless `taskIntent` is explicit.

## Verification plan

- Run focused API tests:
  - `npm.cmd test --workspace=@aif/api -- roadmapGeneration.test.ts`
- Run focused shared tests if `packages/shared/src/taskIntent.ts` changes:
  - `npm.cmd test --workspace=@aif/shared -- taskIntent.test.ts`
- Run lint:
  - `npm.cmd run lint`
- Run build:
  - `npm.cmd run build`
- Run independent `TEST PASS` gate after local tests.
- Run independent `REVIEW PASS` gate after implementation and test gate.

## Reusable patterns

- Prompt constraints are advisory; deterministic validators own typed-intent safety.
- Validate batches before side effects when a fail-closed contract promises no partial import.
