# Design

## Chosen design

Keep the existing hard stop as the default path and add a narrow manifest-backed exception.

The manifest checklist contract will gain explicit disposition arrays for pending checklist items:

- `supersededItems`
- `cancelledItems`
- `waivedItems`

Each disposition entry must contain:

- `item`: normalized checklist text matching one pending plan checklist item.
- `reason`: non-empty explanation.
- `evidenceRefs`: non-empty references to verification evidence already declared in the same implementation manifest.

The shared manifest validator should treat pending checklist counts as acceptable only when:

- the manifest reports consistent counts;
- all pending items from the actual plan are represented by supported disposition entries;
- each disposition has a non-empty reason and evidence refs;
- each evidence ref points to declared verification evidence;
- there are no unsupported or malformed disposition entries.

The implementer should continue to block before review handoff unless a valid implementation manifest from the current result proves all remaining pending checklist items are disposed. This keeps the default behavior fail-closed while allowing the explicit exception from the task source.

## Pre-PLAN boundary

- Allowed before `PLAN PASS`: read local files, inspect local docs, write `research.md`, `design.md`, and `plan.md`, and request independent plan review.
- Not allowed before `PLAN PASS`: implementation edits, test execution, runtime probing, service checks, endpoint checks, log inspection, scheduler reads, or shared-memory recall.

## Implementation boundaries

- Primary code surfaces:
  - `packages/shared/src/implementationManifest.ts`
  - `packages/shared/src/taskCompletionEvidence.ts`
  - `packages/agent/src/subagents/implementer.ts`
  - `packages/agent/src/coordinator.ts`
- Primary test surfaces:
  - `packages/shared/src/__tests__/implementationManifest.test.ts`
  - `packages/shared/src/__tests__/taskCompletionEvidence.test.ts`
  - `packages/agent/src/__tests__/implementer.test.ts`
  - `packages/agent/src/__tests__/coordinator.test.ts`
- Do not change task status enums or database schema. Existing task fields are enough for the blocked state.
- Do not weaken the existing `implementation_checklist_incomplete` hard stop when no valid manifest exception exists.

## Decision candidates

- Checklist disposition evidence should use existing implementation-manifest verification evidence refs instead of adding a second evidence namespace.
- Matching pending checklist items by exact normalized text is safer than fuzzy matching for a hard-stop exception.
- `waivedItems` should require the same evidence strictness as superseded/cancelled items. A bare known limitation is not enough.
