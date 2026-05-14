# Workflow Contract Pack Registry

## Purpose

The workflow pack registry keeps AIF Handoff's core task handoff behavior separate from workflow-specific validation rules.

Core shared code still owns the task intent vocabulary, defaults, prompt formatting, and public `validateGeneratedTaskIntent` API. Workflow packs own generated-task validation semantics for each `TaskIntent`.

## Current Registry

- `packages/shared/src/workflowPacks.ts` defines the `WorkflowPack` interface.
- `WORKFLOW_PACKS` is an immutable registry keyed by every current `TaskIntent`.
- `getWorkflowPack(intent)` is the preferred lookup path.
- `validateGeneratedWorkflowTask(input)` is the registry entry point used by `validateGeneratedTaskIntent(input)`.

Each shared pack exposes:

- `id`: the task intent it handles.
- `label`: the user-facing label from the task intent contract.
- `taskContract`: the existing `TASK_INTENT_CONTRACTS[id]` entry.
- `validateGeneratedTask`: generated-card validation owned by the pack.

## Roadmap Hooks

Roadmap behavior that depends on API, data-access, project-root inspection, runtime prompts, or task-import side effects is owned by an API-local workflow-pack extension in `packages/api/src/services/roadmapWorkflowPacks.ts`.

The extension is keyed by the shared workflow pack identity from `getWorkflowPack(intent)`. This keeps the shared package free of API/data dependencies while still making workflow-specific roadmap behavior explicit.

The audit roadmap extension owns audit-shaped request guards, audit prompt construction, generated roadmap normalization and deterministic fallback, deterministic audit roadmap-to-task conversion, generated batch validation, reused audit alias rejection, audit import tags/defaults, synthesis blocking, artifact collection, and audit batch summary creation.

Generic and non-audit typed roadmaps omit audit hooks and keep the existing generic extraction/import path. Future packs should add only the hooks they own and must include tests proving they do not inherit unrelated audit requirements.

## Audit Pack

The audit pack is a strict adapter over `validateGeneratedAuditCard`.

Do not weaken audit requirements when adding future pack behavior. The audit pack must preserve diagnostic-only markers, concrete scope and risk-hypothesis rules, report-only allowed changes, report artifact validation, synthesis outcome rules, and existing issue messages.

## Feature Canary

The feature pack is intentionally small. It proves non-audit workflows pass through the same registry without audit-only roadmap/report semantics.

Generated feature tasks currently require:

- `Acceptance criteria:`
- `Verification:`

They do not require audit report artifacts, risk hypotheses, diagnostic-only constraints, synthesis outcomes, audit manifests, or report-only allowed changes.

## Adding Future Packs

To add or expand a workflow pack:

1. Keep the task intent contract in `TASK_INTENT_CONTRACTS`.
2. Register the pack in `WORKFLOW_PACKS`.
3. Put generated-task validation in the pack's `validateGeneratedTask`.
4. Add focused tests that prove the pack accepts its own valid card shape and does not inherit unrelated audit semantics.
5. Put dependency-heavy roadmap behavior in the API-local roadmap extension when it needs API/data/runtime/project-root access.
6. Keep artifact, completion, review, and memory behavior out of this registry until a separate task explicitly authorizes that migration.

## Boundaries

This registry and roadmap extension do not introduce database schema, generic persistence, scheduler behavior, UI/API timeline work, generic artifact/claim storage, audit evidence ledger renaming, finance packs, analytics packs, or real non-audit workflow packs beyond the existing feature canary.
