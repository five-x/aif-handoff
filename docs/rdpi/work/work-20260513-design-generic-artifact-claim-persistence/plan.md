# Plan - Generic Artifact Claim Persistence

## Implementation plan

This is a design-only RDPI task. No runtime persistence implementation is authorized in this run.

1. Finish `research.md` and `design.md` from local repo facts, completed dependency RDPI results, and the read-only explorer pass.
2. Run independent plan review and require `PLAN PASS` before close-out.
3. After `PLAN PASS`, do not implement schema, migrations, source code, API routes, UI, or runtime behavior in this task.
4. Record the exact future implementation surfaces:
   - `packages/shared/src/schema.ts`: add generic workflow tables in a future migration.
   - `packages/shared/src/db.ts`: append migration and indexes; do not reorder existing migrations.
   - `packages/shared/src/types.ts`: add generic run/artifact/attempt/claim/evidence-link payloads.
   - `packages/shared/src/index.ts` and `packages/shared/src/browser.ts`: export only stable shared types/helpers.
   - `packages/data/src/index.ts`: add repositories for workflow runs, artifacts, attempts, claims, evidence links, and compatibility readers.
   - `packages/api/src/services/roadmapWorkflowPacks.ts`: add pack hook surfaces only after repository APIs exist.
   - `packages/api/src/services/roadmapGeneration.ts` and `packages/api/src/services/taskEvents.ts`: adapt audit/roadmap event paths only in a compatibility-preserving migration.
   - `packages/agent/src/coordinator.ts`: call generic repository APIs only after stale-boundary and audit trusted-classification tests exist.
   - Targeted tests in `packages/shared`, `packages/data`, `packages/api`, and `packages/agent`.
5. Define future migration modes explicitly before implementation:
   - adapter-only generic summaries over existing audit rows;
   - dual-write/backfill generic rows with audit compatibility tests.
6. Verify this RDPI task as design-only: files changed by this task are limited to this task's RDPI artifacts, `result.md`, memory-review artifacts, and the matching intake status entry.
7. Write `result.md`, run memsync auto mode, and update only the matching `docs/intake/work_status.json` entry after local memory review succeeds.

## Acceptance criteria

- The design defines a generic persistence model for workflow runs, artifacts, artifact attempts, claims, and evidence links.
- The design covers inconclusive, terminal inconclusive, blocked, and manual exception outcomes without treating them as trusted success.
- The design preserves audit artifact lifecycle compatibility and identifies audit rows/functions that remain compatibility sources.
- The design identifies API/data/shared/agent ownership boundaries.
- The design identifies indexes and retention expectations.
- The plan names exact future schema/API/code surfaces to implement later.
- The task does not create runtime persistence changes, database migrations, API routes, UI timelines, or source implementation.
- Independent `PLAN PASS`, `TEST PASS`, and `REVIEW PASS` gates are recorded before close-out.

## Verification plan

- Independent plan reviewer checks `research.md`, `design.md`, and `plan.md` and returns `PLAN PASS` or `PLAN FAIL`.
- After `PLAN PASS`, verify:
  - no `packages/**` source file was modified by this task;
  - `research.md`, `design.md`, and `plan.md` are no longer managed templates;
  - the plan contains exact future implementation surfaces;
  - the design explicitly preserves `roadmap_batch_*` and `audit_evidence_events` compatibility;
  - the design rejects in-place audit table widening and raw evidence persistence;
  - `docs/intake/work_status.json` remains valid JSON after close-out.
- Independent tester returns `TEST PASS` or `TEST FAIL` for the design-only artifact verification.
- Independent final reviewer returns `REVIEW PASS` or `REVIEW FAIL` and confirms no runtime persistence implementation was performed.
- Run `python "$env:USERPROFILE\.codex\tools\codex-memsync.py" --repo . --mode auto --lane work --task-id work-20260513-design-generic-artifact-claim-persistence --project aif-handoff --entity aif-handoff`.
- Treat local memory review failure as blocking. Treat shared-memory publish failure after local review as a warning.

## Reusable patterns

- Keep pack-neutral persistence separate from workflow-pack semantics.
- Add append-only history plus mutable read models transactionally.
- Preserve audit compatibility through adapters and tests before migrating read/write paths.
- Close design tasks with implementation-ready surfaces, not implementation in the same run.
