# Design

## Chosen design

Use a fail-closed lifecycle correction at the shared evidence and projection layers, with API/coordinator decision logic unified around one shared helper.

1. Shared completion evidence becomes the first guard. Explicit `source_inconclusive` or `inconclusive_batch_evidence` synthesis remains a valid report classification, but it is not successful task completion. It emits `audit_inconclusive` so coordinator/API approval cannot mark the task verified or write a trusted artifact.
2. Shared audit-card decision construction becomes reusable. Coordinator and API both call the same helper so `source_inconclusive` and inconclusive synthesis are consistently `finalStatus: "audit_inconclusive"` with inaccessible verification.
3. Source-inconclusive implementer terminalization remains terminal for the artifact but non-green for the task. It writes `source_inconclusive` artifact state and blocks the task with a concrete reason instead of setting `done` with cleared blockers.
4. Data projection defensively treats `audit_inconclusive` decisions as untrusted even when legacy persisted rows still say `state: "valid"`. Such rows must not have `trustedSynthesisInput=true`, next action `none`, or batch `complete`.
5. UI behavior remains mostly projection-driven. If data sends untrusted/non-green rollup semantics, existing UI trust presentation can render warning/untrusted labels; small UI tests may be updated only where labels encode the stale trusted result.

This is chosen because the task asks for a canonical lifecycle correction, not only a rendering fix. Blocking at shared completion prevents new bad state; projection downgrade prevents old or alternate paths from still looking green.

## Pre-PLAN boundary

- Before `PLAN PASS`, only planning artifacts and source inspection are allowed.
- No implementation edits, runtime service checks, log inspection, endpoint probing, or shared-memory recall are included here.
- The independent explorer performed read-only local code investigation and returned planning findings only.

## Scope boundaries

- In scope:
  - `packages/shared/src/taskCompletionEvidence.ts`
  - `packages/shared/src/auditCardDecision.ts`
  - `packages/shared/src/index.ts` export surface if needed
  - `packages/agent/src/coordinator.ts`
  - `packages/agent/src/subagents/implementer.ts`
  - `packages/api/src/services/taskEvents.ts`
  - `packages/data/src/index.ts`
  - Targeted regression tests in shared, agent, API, data, and web where presentation expectations change.
- Out of scope:
  - New task status enum values unless required.
  - Audit source validator relaxation.
  - Operator-input/runtime retry normalization, deterministic backoff, inferred-development manifest gates, or waiver hardening. Those are separate queued tasks.
  - Historical database migrations unless tests show projection-only downgrade cannot satisfy the task.

## Decision candidates

- Decision: explicit audit inconclusive is an accepted artifact classification but not a trusted task-success lifecycle state.
- Decision: coordinator and API approval must share one audit-card decision path.
- Decision: projection must fail closed for legacy `valid` + `audit_inconclusive` synthesis rows.
