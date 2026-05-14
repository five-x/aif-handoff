# Result - Generalize Evidence Unit Aliases For Audit Ledger

## Outcome summary

Implemented additive generic evidence unit aliases while preserving audit ledger compatibility.

- Added shared `EvidenceUnit*` types, `EVIDENCE_UNIT_*` constants, and generic builder/reader/helper aliases over the existing audit evidence ledger model.
- Added data-layer `appendEvidenceUnitEvent` and `listEvidenceUnitEvents` wrappers that delegate to the existing `audit_evidence_events` storage path.
- Updated Codex and Qwen runtime evidence events to keep `audit:evidence` and `data.auditEvidence` while also emitting `data.evidenceUnit`.
- Updated the agent event bridge to persist either `auditEvidence` or the generic `evidenceUnit` alias.
- Added focused shared, data, runtime, and agent tests proving alias compatibility and preserved audit flows.

No audit table, audit column, runtime event type, audit report validator field, generic artifact/claim persistence, or UI/API timeline work was introduced.

## Gate verdicts

- Plan review: `PLAN PASS`
- Test gate: `TEST PASS`
- Final review: `REVIEW PASS`
- User waivers: none

## Verification

- `npm.cmd test --workspace=@aif/shared -- --run src/__tests__/auditEvidenceLedger.test.ts`: PASS, 7 tests.
- `npm.cmd test --workspace=@aif/data -- --run src/__tests__/auditEvidenceLedger.test.ts`: PASS, 2 tests.
- `npm.cmd test --workspace=@aif/runtime -- --run src/__tests__/qwenLocalAgent.test.ts src/adapters/codex/appServer/__tests__/eventMapper.test.ts`: PASS, 50 tests.
- `npm.cmd test --workspace=@aif/agent -- --run src/__tests__/subagentQuery.test.ts`: PASS, 34 tests.
- `npm.cmd run build --workspace=@aif/shared`: PASS.
- `npm.cmd run build --workspace=@aif/data`: PASS.
- `npm.cmd run build --workspace=@aif/runtime`: PASS.
- `npm.cmd run build --workspace=@aif/agent`: PASS.
- `git diff --check`: PASS.

Independent tester reran the full verification set and returned `TEST PASS`.

## Stable facts

- Generic evidence unit vocabulary is now available as an additive alias over the audit evidence ledger model.
- The durable storage table remains `audit_evidence_events`.
- Runtime evidence routing still uses `audit:evidence`; payloads now include both `auditEvidence` and `evidenceUnit`.
- Audit completion and report validation compatibility remains on `auditEvidenceUnits` for this slice.

## Reusable patterns

- For durable audit/runtime vocabulary migrations, add generic aliases first, keep existing storage and routing keys stable, and prove old and new consumers can read the same payload before attempting any destructive rename.

## Memory sync

- `python "$env:USERPROFILE\.codex\tools\codex-memsync.py" --repo . --mode auto --lane work --task-id work-20260513-generalize-evidence-unit-aliases --project aif-handoff --entity aif-handoff`: completed.
- Report: `docs/memory/reports/work-20260513-generalize-evidence-unit-aliases-memsync-report.md`.
- Generated local artifacts include task delta/hypotheses, updated project/entity capsules, decision documents, and pattern documents under `docs/memory/`.
- Auto-publish status: ingested generated decision and pattern documents.
