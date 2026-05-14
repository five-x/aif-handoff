# Design - Add Artifact Claim And Evidence Timelines

## Chosen design

Implement an adapter-only task-scoped workflow timeline.

This task will not add `workflow_*` tables, migrations, dual-write behavior, backfill behavior, or generic durable claim persistence. The accepted persistence design has not been implemented in source, so the safest useful slice is a generic read DTO over existing compatibility sources.

The API response should be pack-neutral at the top level and audit-compatible in details:

- workflow context: task id, project id, workflow pack id, workflow kind, roadmap alias, source kind, source id, status, and generated timestamp.
- artifacts: generic artifact rows mapped from `roadmap_batch_artifacts` for audit tasks.
- attempts: generic attempt rows mapped from `roadmap_batch_artifact_attempts`.
- claims: compatibility claims derived from artifact current state and attempt state, using generic outcomes such as `supported`, `refuted`, `inconclusive`, `blocked`, `waived`, and `not_evaluated`.
- evidence: generic evidence units exposed through the existing evidence-unit aliases over `audit_evidence_events`.
- evidence links: bounded links from evidence units to the relevant task/artifact/claim as compatibility context.
- events: a sorted presentation timeline composed from artifact creation/update, attempts, claims, and evidence units.

For non-audit workflows, the same endpoint returns the same generic shape with workflow context and empty artifacts/claims/evidence until real generic persistence exists. The UI component also gets a unit test with a feature-shaped generic artifact/claim/evidence fixture so rendering is not audit-coupled.

## API and data boundary

Add stable shared browser-safe timeline types in `packages/shared/src/types.ts` and export them from `packages/shared/src/index.ts` and `packages/shared/src/browser.ts`.

Add a data-layer read model builder in `packages/data/src/index.ts`:

- `buildTaskWorkflowTimeline(taskId: string): WorkflowTimeline | null`.
- It returns `null` if the task is missing.
- It reads the task and all roadmap artifacts for that task.
- It maps existing audit rows into the generic DTO without writing anything.
- It uses existing evidence-unit alias readers for task-scoped evidence events.
- It does not read artifact files or parse report markdown.

Add an API route in `packages/api/src/routes/tasks.ts`:

- `GET /tasks/:id/timeline`.
- Return `404` when the task is missing.
- Return the generic timeline response otherwise.

Add a web API client method and hook:

- `api.getTaskTimeline(id)`.
- `useTaskTimeline(id)`.

Add a structured timeline UI:

- Add a `timeline` tab to task detail.
- Add a `WorkflowTimelinePanel` component that renders artifact, claim, evidence, and attempt events from the generic DTO.
- Use generic labels in primary UI: artifact, claim, evidence, attempt, supported, refuted, inconclusive, blocked, waived.
- Keep audit details such as source classification, failure family, role, and roadmap alias as secondary metadata.
- Show an empty state for workflows without persisted artifacts yet.

## Compatibility mappings

Artifact role:

- audit `report` maps to artifact kind `audit.source_report`.
- audit `synthesis` maps to artifact kind `audit.synthesis_report`.

Artifact state:

- `valid` maps to generic state `accepted`.
- `expected` maps to `expected`.
- `invalid` maps to `rejected`.
- `missing` maps to `missing`.
- `synthesis_not_ready` maps to `inconclusive`.
- `external_blocked` maps to `blocked`.
- `source_inconclusive` and `terminal_inconclusive` map to `inconclusive`.
- `manual_exception` maps to `manual_exception`.

Claim outcome:

- `valid` maps to `supported`.
- `invalid` or `missing` maps to `refuted`.
- `external_blocked` maps to `blocked`.
- `source_inconclusive`, `terminal_inconclusive`, and `synthesis_not_ready` map to `inconclusive`.
- `manual_exception` maps to `waived`.
- `expected` maps to `not_evaluated`.

Trust level:

- `valid` with no failure family maps to `trusted`.
- `manual_exception` maps to `weak`.
- all rejected, blocked, missing, or inconclusive compatibility states map to `untrusted`.
- `expected` maps to `weak`.

Evidence links:

- Existing task-scoped evidence units map to generic `evidence` entries.
- If a current task artifact exists, each task-scoped evidence unit links to the first relevant current artifact and compatibility claim as `context`, or `supports` when the compatibility claim outcome is `supported`.
- This is a display compatibility link only. It does not assert durable claim truth beyond the existing audit validation details.

## Pre-PLAN boundary

Before `PLAN PASS`, this task may edit only `research.md`, `design.md`, and `plan.md`. It must not change source code, migrations, runtime behavior, API routes, UI, shared-memory state, worker reports, live services, or downstream runtime configuration.

## Decision candidates

- Use adapter-only timeline reads until generic workflow persistence exists in source.
- Expose one generic task-scoped timeline DTO rather than audit-specific task fields.
- Keep audit-specific details as metadata, not primary UI vocabulary.
- Do not parse artifact markdown in the timeline endpoint; durable evidence rows and artifact rows remain the accepted compatibility sources.
