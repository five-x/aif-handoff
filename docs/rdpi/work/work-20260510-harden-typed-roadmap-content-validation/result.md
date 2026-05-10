# Result: Harden Typed Roadmap Content Validation

Task: `work-20260510-harden-typed-roadmap-content-validation`
Date: 2026-05-10
Status: implemented

## Outcome

Typed audit roadmap validation now fails closed across source roadmap generation, existing-roadmap extraction, generated JSON batches, and generated task import.

Explicit `taskIntent: "audit"` roadmaps now reject implementation-shaped audit milestones such as `Critical Bug Resolution`, `Architecture Refactoring`, `Security Hardening`, and `Test Suite Expansion`. `Audit:` prefixes can no longer mask implementation work.

## Implementation Summary

- Added deterministic audit source roadmap validation in `packages/api/src/services/roadmapGeneration.ts` before writing generated audit roadmaps and before extracting tasks from an existing `.ai-factory/ROADMAP.md`.
- Added generated/import batch validation before duplicate skipping or task creation, so one invalid generated task prevents partial import, including invalid duplicate cards.
- Required exactly one final synthesis card for explicit audit generated/import batches.
- Tightened audit generated-card validation in `packages/shared/src/taskIntent.ts` so cards reject implementation-shaped descriptions, `Allowed changes: None`, non-report allowed edits, and missing/non-concrete `.md` report artifact paths.
- Aligned the audit roadmap generation prompt with validator requirements by requiring Evidence/Risk/Verification wording on the final synthesis example.
- Added focused regression tests for source roadmap rejection, generated JSON rejection, import rejection, duplicate prevalidation, synthesis count, report artifact paths, and preserved generic behavior.

## Review Remediations

- PLAN FAIL 1: revised the plan so every generated task is validated before duplicate skipping or creation, and so audit generated/import batches require exactly one final synthesis card.
- REVIEW FAIL 1: tightened `Allowed changes` parsing so report artifacts are allowed but extra source/config/test/package paths are rejected.
- REVIEW FAIL 2: required generated/imported audit cards to name a concrete `.md` report artifact path, not just include the `Report artifact:` marker.
- REVIEW FAIL 3: updated the audit roadmap prompt final synthesis example to include the same Evidence/Risk/Verification framing required by the validator.

## Verification

Local verification passed after the final remediation:

- `npm.cmd test --workspace=@aif/api -- roadmapGeneration.test.ts`
- `npm.cmd test --workspace=@aif/shared -- taskIntent.test.ts`
- `npm.cmd run lint`
- `npm.cmd run build`
- `npm.cmd test -- --concurrency=1`
- `git diff --check`

The default parallel `npm.cmd test` path was not used for final verification because earlier runs exposed unrelated Turbo/package parallel contention in `@aif/shared` `taskCompletionEvidence.test.ts`; isolated package tests and the full serialized workspace run passed.

Build and lint passed with the existing environment warning that global Turbo `2.9.6` is being used because no locally installed Turbo was found.

## Gates

- PLAN review: initial `PLAN FAIL`, revised artifacts, then `PLAN PASS`.
- Independent TEST gate: final `TEST PASS`.
- Independent REVIEW gate: final `REVIEW PASS`.

## Memory Sync

Memsync local review completed in `auto` mode.

- Report: `docs/memory/reports/work-20260510-harden-typed-roadmap-content-validation-memsync-report.md`
- Task delta: `docs/memory/tasks/work/work-20260510-harden-typed-roadmap-content-validation-delta.md`
- Shared-memory remember path: one validated short fact submitted.
