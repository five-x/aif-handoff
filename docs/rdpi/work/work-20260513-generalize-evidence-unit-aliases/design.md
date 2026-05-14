# Design - Generalize Evidence Unit Aliases For Audit Ledger

## Chosen design

Use additive aliases at narrow boundaries:

- Shared model aliases:
  - Export `EVIDENCE_UNIT_*` constants as aliases of the existing audit constants.
  - Export `EvidenceUnit*` types as aliases of existing `AuditEvidence*` types.
  - Export `buildEvidenceUnitPayload`, `buildEvidenceUnit`, `readEvidenceUnitRuntimePayload`, and related normalization/hash helpers as aliases over the existing audit functions.
- Data access aliases:
  - Add `ListEvidenceUnitEventsOptions` as an alias of `ListAuditEvidenceEventsOptions`.
  - Add `appendEvidenceUnitEvent(unit)` and `listEvidenceUnitEvents(options)` wrappers that delegate to `appendAuditEvidenceEvent` and `listAuditEvidenceEvents`.
- Runtime payload compatibility:
  - Keep event type `audit:evidence`.
  - Keep `data.auditEvidence`.
  - Add `data.evidenceUnit` with the same payload object for Codex and Qwen runtime evidence events.
- Agent/API bridge:
  - Let persistence read `event.data.auditEvidence ?? event.data.evidenceUnit` where runtime events are bridged.
  - Keep validator inputs named `auditEvidenceUnits` in this slice.

This design adds the generic vocabulary at the shared/data/runtime event boundary while leaving audit storage, audit manifest refs, completion evidence field names, audit report validators, and audit-specific semantics intact.

## Pre-PLAN boundary

Before `PLAN PASS`, only planning artifacts and static local source inspection are allowed. No tests, builds, runtime service checks, scheduler reads, log reads, endpoint checks, downstream runtime/config reads, or shared-memory recall are allowed.

Implementation starts only after independent `PLAN PASS`.

## Scope boundaries

- No database table or column rename.
- No storage migration.
- No generic artifact/claim persistence.
- No UI timeline or API timeline feature.
- No retirement of audit-specific names.
- No weakening of audit evidence relevance, provenance, manifest, or completion evidence semantics.
- No child follow-up task execution.

## Decision candidates

- Additive aliases are the safe migration primitive when core vocabulary needs to evolve before storage and validator fields can be renamed.
- Runtime events can carry compatibility aliases in `data` while preserving the event type as the durable routing key.
