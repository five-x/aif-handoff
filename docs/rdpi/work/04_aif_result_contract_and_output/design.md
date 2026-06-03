# Design

## Chosen design

Use the existing shared `aifResultContract` module as the strict contract boundary and update consumers to match the source brief.

1. Replace the old loose schema with a strict result model:
   - statuses: `completed`, `blocked`, `needs_input`;
   - stop reasons: `done`, `blocked_by_validation`, `blocked_by_scope`, `needs_human_input`;
   - structured verification entries;
   - structured resolved and unresolved blocker entries;
   - `taskId` validation against an optional expected task id.
2. Keep parsing exactly one fenced `aif-result` block. Multiple blocks, invalid JSON, unsupported status/stop reason, missing `taskId`, completed-with-unresolved-blockers, and completed-without-passed-verification all fail validation.
3. Treat `blocked` and `needs_input` as valid structured outputs, but not as successful rework completion. The implementer should persist a structured blocked state instead of pretending completion succeeded.
4. Replace rework final-output prompt guidance with a single-block contract and remove prompt language that requires narrative final result text, explicit prose listings, or restating the task.
5. Update deterministic `aif-result` appenders to emit the new schema with `taskId`, `verification[]`, blocker objects, and `stopReason`.
6. Add a shared stronger-evidence helper to `taskCompletionEvidence.ts` so missing/invalid `aif-result` is not considered fatal when trusted evidence already exists:
   - valid current implementation manifest;
   - valid current `aif-result` plus observed/passed verification;
   - accepted operator verified completion evidence represented by trusted committed files and trusted verification commands;
   - deterministic recovery manifest only when its validation is `ok=true`.

## Pre-PLAN boundary

- Planning artifacts may record source requirements, local source facts, prior local RDPI/memory context, hypotheses, scope boundaries, and verification plans.
- No implementation edits, live service checks, endpoint checks, log inspection, scheduler reads, or shared-memory recall before `PLAN PASS`.

## Scope boundaries

- In scope:
  - `packages/shared/src/aifResultContract.ts`
  - `packages/shared/src/__tests__/aifResultContract.test.ts`
  - `packages/shared/src/taskCompletionEvidence.ts`
  - `packages/shared/src/__tests__/taskCompletionEvidence.test.ts`
  - `packages/agent/src/subagents/implementer.ts`
  - `packages/agent/src/__tests__/implementer.test.ts`
  - RDPI artifacts for this task.
- Out of scope:
  - New UI/API surface unless needed by tests.
  - Reworking implementation-manifest validation semantics except to consume it as stronger evidence.
  - Changing operator verified completion endpoint semantics beyond existing trusted evidence inputs.
  - Running or validating live deployments.

## Decision candidates

- Strict `aif-result` output blocks should be schema-validated in shared code, not by prompt-only conventions.
- Lower-priority missing narrative/contract evidence should not override higher-priority trusted implementation or operator evidence.
