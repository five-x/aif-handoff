<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

# Memory Sync Report

- Generated at: `2026-05-13T19:40:35Z`
- Repo: `C:\Users\apron\source\aif-handoff`
- Task: `work-20260513-generalize-evidence-unit-aliases`
- Lane: `work`
- Mode: `auto`
- Project: `aif-handoff`
- Entity: `aif-handoff`

## Sync Status

- Status: `success`
- Reason: `ingested 28 shared-memory items`

## Candidate Summary

- Facts: `11`
- Decisions: `16`
- Patterns: `2`
- Hypotheses: `5`
- Short facts for remember path: `10`

## Generated Docs

- `C:\Users\apron\source\aif-handoff\docs\memory\tasks\work\work-20260513-generalize-evidence-unit-aliases-delta.md`
- `C:\Users\apron\source\aif-handoff\docs\memory\projects\aif-handoff\capsule.md`
- `C:\Users\apron\source\aif-handoff\docs\memory\entities\aif-handoff\capsule.md`
- `C:\Users\apron\source\aif-handoff\docs\memory\decisions\decision-e123065276bfa2f3.md`
- `C:\Users\apron\source\aif-handoff\docs\memory\decisions\decision-cb10339bce7bca83.md`
- `C:\Users\apron\source\aif-handoff\docs\memory\decisions\decision-966150b417fa1811.md`
- `C:\Users\apron\source\aif-handoff\docs\memory\decisions\decision-470f06da2bd7e091.md`
- `C:\Users\apron\source\aif-handoff\docs\memory\decisions\decision-4ce222e29c2deb98.md`
- `C:\Users\apron\source\aif-handoff\docs\memory\decisions\decision-60aad7928e760076.md`
- `C:\Users\apron\source\aif-handoff\docs\memory\decisions\decision-d76739d54b588c74.md`
- `C:\Users\apron\source\aif-handoff\docs\memory\decisions\decision-ec7859df3224bb20.md`
- `C:\Users\apron\source\aif-handoff\docs\memory\decisions\decision-7f82c1b6227447e7.md`
- `C:\Users\apron\source\aif-handoff\docs\memory\decisions\decision-fd669c0d718c6d67.md`
- `C:\Users\apron\source\aif-handoff\docs\memory\decisions\decision-f61b30f98bb708b1.md`
- `C:\Users\apron\source\aif-handoff\docs\memory\decisions\decision-1a433f7705c524c6.md`
- `C:\Users\apron\source\aif-handoff\docs\memory\decisions\decision-56cab83e593c7fd4.md`
- `C:\Users\apron\source\aif-handoff\docs\memory\decisions\decision-4881841aa9558fc0.md`
- `C:\Users\apron\source\aif-handoff\docs\memory\decisions\decision-8bd0b537c3e7c48a.md`
- `C:\Users\apron\source\aif-handoff\docs\memory\decisions\decision-00c299f71d0a944d.md`
- `C:\Users\apron\source\aif-handoff\docs\memory\patterns\pattern-5a6bbffa16661dad.md`
- `C:\Users\apron\source\aif-handoff\docs\memory\patterns\pattern-3fc529d8c3429e26.md`
- `C:\Users\apron\source\aif-handoff\docs\memory\tasks\work\work-20260513-generalize-evidence-unit-aliases-hypotheses.md`

## Publish Results

- REMEMBERED fact: The ledger storage table is `audit_evidence_events` in `packages/shared/src/schema.ts`. The task explicitly requires compatibility, so this table and its column names should not be renamed.
- REMEMBERED fact: The current shared public surface exports audit-specific names from `packages/shared/src/index.ts`; browser exports currently omit the ledger surface.
- REMEMBERED fact: `packages/data/src/index.ts` stores and lists `AuditEvidenceUnit` rows through `appendAuditEvidenceEvent` and `listAuditEvidenceEvents`, converting the audit table row shape back into the shared unit shape.
- REMEMBERED fact: Runtime adapters emit `audit:evidence` events with `data.auditEvidence` payloads. Agent bridges persist that payload through `persistAuditEvidencePayload`.
- REMEMBERED fact: Completion evidence and audit validators still accept `auditEvidenceUnits`, and preserving that field is required for audit report compatibility.
- REMEMBERED fact: Recent workflow pack work introduced a core registry but explicitly left audit evidence ledger renaming and generic artifact persistence out of scope.
- REMEMBERED fact: Generic evidence unit vocabulary is now available as an additive alias over the audit evidence ledger model.
- REMEMBERED fact: The durable storage table remains `audit_evidence_events`.
- REMEMBERED fact: Runtime evidence routing still uses `audit:evidence`; payloads now include both `auditEvidence` and `evidenceUnit`.
- REMEMBERED fact: Audit completion and report validation compatibility remains on `auditEvidenceUnits` for this slice.
- INGESTED decision-e123065276bfa2f3.md
- INGESTED decision-cb10339bce7bca83.md
- INGESTED decision-966150b417fa1811.md
- INGESTED decision-470f06da2bd7e091.md
- INGESTED decision-4ce222e29c2deb98.md
- INGESTED decision-60aad7928e760076.md
- INGESTED decision-d76739d54b588c74.md
- INGESTED decision-ec7859df3224bb20.md
- INGESTED decision-7f82c1b6227447e7.md
- INGESTED decision-fd669c0d718c6d67.md
- INGESTED decision-f61b30f98bb708b1.md
- INGESTED decision-1a433f7705c524c6.md
- INGESTED decision-56cab83e593c7fd4.md
- INGESTED decision-4881841aa9558fc0.md
- INGESTED decision-8bd0b537c3e7c48a.md
- INGESTED decision-00c299f71d0a944d.md
- INGESTED pattern-5a6bbffa16661dad.md
- INGESTED pattern-3fc529d8c3429e26.md
