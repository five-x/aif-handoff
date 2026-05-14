<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

---

memory_id: task::aif-handoff::work::work-20260513-generalize-evidence-unit-aliases::delta
project_id: project::aif-handoff
repo_name: aif-handoff
lane: work
task_id: work-20260513-generalize-evidence-unit-aliases
source_path: docs/rdpi/work/work-20260513-generalize-evidence-unit-aliases
stability: validated
sensitivity: local-only
kind: artifact
project: aif-handoff
entity: aif-handoff
scope: task
updated_at: 2026-05-13
supersedes:
expires_at:
tags:

- aif-handoff
- aif-handoff
- aif-handoff
- work
- task-delta
  source_refs:
- docs/rdpi/work/work-20260513-generalize-evidence-unit-aliases/research.md
- docs/rdpi/work/work-20260513-generalize-evidence-unit-aliases/design.md
- docs/rdpi/work/work-20260513-generalize-evidence-unit-aliases/plan.md
- docs/rdpi/work/work-20260513-generalize-evidence-unit-aliases/result.md
  created_at: 2026-05-13
  last_verified_at: 2026-05-13

---

# Summary

Curated delta for task work-20260513-generalize-evidence-unit-aliases.

# Why it matters

Keeps the reusable task outcome in one reviewable place before publication.

# When to reuse

Reuse this document when checking what was learned from this task.

# When not to reuse

Do not treat task-local implementation details as cross-project guidance unless they were promoted into decisions or patterns.

## Facts

- The ledger storage table is `audit_evidence_events` in `packages/shared/src/schema.ts`. The task explicitly requires compatibility, so this table and its column names should not be renamed.
- `packages/shared/src/auditEvidenceLedger.ts` owns the current evidence model: runtime event type, kinds, grades, redaction status, runtime payload, final unit, payload builder, unit builder, normalization, hashing, and payload reader.
- The current shared public surface exports audit-specific names from `packages/shared/src/index.ts`; browser exports currently omit the ledger surface.
- `packages/data/src/index.ts` stores and lists `AuditEvidenceUnit` rows through `appendAuditEvidenceEvent` and `listAuditEvidenceEvents`, converting the audit table row shape back into the shared unit shape.
- Runtime adapters emit `audit:evidence` events with `data.auditEvidence` payloads. Agent bridges persist that payload through `persistAuditEvidencePayload`.
- Completion evidence and audit validators still accept `auditEvidenceUnits`, and preserving that field is required for audit report compatibility.
- Recent workflow pack work introduced a core registry but explicitly left audit evidence ledger renaming and generic artifact persistence out of scope.
- Generic evidence unit vocabulary is now available as an additive alias over the audit evidence ledger model.
- The durable storage table remains `audit_evidence_events`.
- Runtime evidence routing still uses `audit:evidence`; payloads now include both `auditEvidence` and `evidenceUnit`.
- Audit completion and report validation compatibility remains on `auditEvidenceUnits` for this slice.

## Decisions

- Additive aliases are the safe migration primitive when core vocabulary needs to evolve before storage and validator fields can be renamed.
- Runtime events can carry compatibility aliases in `data` while preserving the event type as the durable routing key.
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

## Patterns

- For vocabulary migrations across durable audit/runtime boundaries, introduce generic aliases first, keep durable routing/storage names unchanged, and prove both old and new consumers can read the same payload.
- For durable audit/runtime vocabulary migrations, add generic aliases first, keep existing storage and routing keys stable, and prove old and new consumers can read the same payload before attempting any destructive rename.
