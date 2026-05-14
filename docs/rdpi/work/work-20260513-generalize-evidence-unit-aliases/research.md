# Research - Generalize Evidence Unit Aliases For Audit Ledger

## Task framing and lane

- Task ID: `work-20260513-generalize-evidence-unit-aliases`
- Lane: `work`
- Intake source: `docs/intake/work/work-20260513-generalize-evidence-unit-aliases.md`
- RDPI Needed: `yes`
- Task intent: generalize audit evidence ledger naming to core evidence unit aliases while preserving audit ledger storage compatibility and current audit report behavior.

## Accepted planning sources

- Immutable task card: `docs/intake/work/work-20260513-generalize-evidence-unit-aliases.md`
- Parent planning source: `docs/rdpi/work/work-20260513-define-workflow-contract-pack-interface/plan.md`
- Dependency result: `docs/rdpi/work/work-20260513-implement-workflow-pack-registry-feature-canary/result.md`
- Current registry note: `docs/kb/workflow-contract-pack-registry.md`
- Audit provenance contract: `docs/kb/audit-evidence-provenance-contract.md`
- Related ledger result: `docs/rdpi/work/work-20260512-audit-evidence-ledger/result.md`
- Local code references read before planning:
  - `packages/shared/src/auditEvidenceLedger.ts`
  - `packages/shared/src/index.ts`
  - `packages/shared/src/browser.ts`
  - `packages/shared/src/schema.ts`
  - `packages/data/src/index.ts`
  - `packages/data/src/__tests__/auditEvidenceLedger.test.ts`
  - `packages/runtime/src/adapters/codex/auditEvidence.ts`
  - `packages/runtime/src/adapters/qwenLocalAgent/api.ts`
  - `packages/runtime/src/adapters/codex/appServer/__tests__/eventMapper.test.ts`
  - `packages/runtime/src/__tests__/qwenLocalAgent.test.ts`
  - `packages/agent/src/hooks.ts`
  - `packages/agent/src/subagentQuery.ts`
  - `packages/agent/src/reviewGate.ts`
  - `packages/agent/src/coordinator.ts`
  - `packages/api/src/services/taskEvents.ts`

No runtime-visible evidence, service probing, log inspection, or shared-memory recall was performed before `PLAN PASS`.

## Local facts

- The ledger storage table is `audit_evidence_events` in `packages/shared/src/schema.ts`. The task explicitly requires compatibility, so this table and its column names should not be renamed.
- `packages/shared/src/auditEvidenceLedger.ts` owns the current evidence model: runtime event type, kinds, grades, redaction status, runtime payload, final unit, payload builder, unit builder, normalization, hashing, and payload reader.
- The current shared public surface exports audit-specific names from `packages/shared/src/index.ts`; browser exports currently omit the ledger surface.
- `packages/data/src/index.ts` stores and lists `AuditEvidenceUnit` rows through `appendAuditEvidenceEvent` and `listAuditEvidenceEvents`, converting the audit table row shape back into the shared unit shape.
- Runtime adapters emit `audit:evidence` events with `data.auditEvidence` payloads. Agent bridges persist that payload through `persistAuditEvidencePayload`.
- Completion evidence and audit validators still accept `auditEvidenceUnits`, and preserving that field is required for audit report compatibility.
- Recent workflow pack work introduced a core registry but explicitly left audit evidence ledger renaming and generic artifact persistence out of scope.

## Same-project memory

Same-project memory may be useful during close-out to publish curated reusable facts about the additive alias pattern, but memory was not queried during planning because the RDPI pre-plan boundary forbids shared-memory recall.

## Cross-project reusable patterns

Local instructions favor additive, reviewable, compatibility-preserving migrations. This task should use aliases and wrappers over destructive renames.

## Rejected or stale memory candidates

None evaluated before `PLAN PASS`.

## Open questions

- Should generic aliases be exported from the browser-safe shared entry point? Hypothesis: not in this slice, because current ledger builders depend on Node APIs and are not browser-safe.
- Should API/agent validator input names move from `auditEvidenceUnits` to `evidenceUnits` now? Hypothesis: not yet, because audit report compatibility expects the audit-specific field and broader validator migration is outside this task.
- Should runtime events change type from `audit:evidence` to a generic event type? Hypothesis: no; changing the event type would risk persistence compatibility. A payload alias can prove the vocabulary without breaking consumers.

## Hypotheses

- H1: The smallest safe shared/API boundary is to add generic `EvidenceUnit*` type/function aliases in the shared ledger module and root export while retaining all audit-named exports.
- H2: Data-layer generic append/list wrappers can call the existing audit ledger functions and return the same persisted row shape, proving storage compatibility.
- H3: Runtime event payloads can carry both `auditEvidence` and `evidenceUnit` keys while keeping `audit:evidence` as the event type, allowing newer code to read the generic alias and older code to keep working.
- H4: Agent event persistence should prefer the audit key for compatibility but accept `evidenceUnit` as an additive alias.
- H5: Focused shared, data, runtime, and agent tests can prove aliases are identity-compatible and existing audit flows still work without a broad monorepo test run.
