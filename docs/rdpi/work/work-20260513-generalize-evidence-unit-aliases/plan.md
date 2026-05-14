# Plan - Generalize Evidence Unit Aliases For Audit Ledger

## Implementation plan

1. Add generic evidence unit aliases in `packages/shared/src/auditEvidenceLedger.ts`.
   - Alias current audit constants, types, payload builders, unit builders, normalization helpers, hashing helpers, and payload reader.
   - Preserve every existing audit-named export.

2. Export the new shared aliases from `packages/shared/src/index.ts`.
   - Do not add them to `packages/shared/src/browser.ts` unless implementation proves they are browser-safe without pulling Node-only dependencies.

3. Add data-layer compatibility wrappers in `packages/data/src/index.ts`.
   - `ListEvidenceUnitEventsOptions` delegates to `ListAuditEvidenceEventsOptions`.
   - `appendEvidenceUnitEvent` delegates to `appendAuditEvidenceEvent`.
   - `listEvidenceUnitEvents` delegates to `listAuditEvidenceEvents`.
   - Keep `audit_evidence_events` schema and row exports unchanged.

4. Add runtime payload aliases.
   - In Codex runtime evidence emission, build the payload once and set both `auditEvidence` and `evidenceUnit` to the same payload object.
   - In Qwen local runtime evidence emission, do the same.
   - Keep event type `audit:evidence` and audit-specific messages unchanged for compatibility.

5. Add agent bridge alias reading.
   - When `AUDIT_EVIDENCE_RUNTIME_EVENT_TYPE` events are observed, persist `event.data.auditEvidence ?? event.data.evidenceUnit`.
   - Keep `persistAuditEvidencePayload` name and activity log wording for compatibility.

6. Add focused tests.
   - Shared ledger test proves generic builders/readers are aliases that produce the same stored-compatible shape.
   - Data ledger test proves generic append/list wrappers persist and query the existing audit table shape.
   - Runtime tests prove emitted events include both `auditEvidence` and `evidenceUnit` while existing audit assertions still pass.
   - Agent subagent bridge test proves a runtime event with only `evidenceUnit` still persists through the existing audit persistence hook.

7. Run verification.
   - `npm.cmd test --workspace=@aif/shared -- --run src/__tests__/auditEvidenceLedger.test.ts`
   - `npm.cmd test --workspace=@aif/data -- --run src/__tests__/auditEvidenceLedger.test.ts`
   - `npm.cmd test --workspace=@aif/runtime -- --run src/__tests__/qwenLocalAgent.test.ts src/adapters/codex/appServer/__tests__/eventMapper.test.ts`
   - `npm.cmd test --workspace=@aif/agent -- --run src/__tests__/subagentQuery.test.ts`
   - `npm.cmd run build --workspace=@aif/shared`
   - `npm.cmd run build --workspace=@aif/data`
   - `npm.cmd run build --workspace=@aif/runtime`
   - `npm.cmd run build --workspace=@aif/agent`
   - `git diff --check`

8. Complete RDPI close-out.
   - Run independent `TEST PASS` gate after verification.
   - Run independent `REVIEW PASS` gate after implementation and tests.
   - Write `result.md`.
   - Run `python "$env:USERPROFILE\.codex\tools\codex-memsync.py" --repo . --mode auto --lane work --task-id work-20260513-generalize-evidence-unit-aliases --project aif-handoff --entity aif-handoff`.
   - Mark only `work-20260513-generalize-evidence-unit-aliases` done in `docs/intake/work_status.json` after local memory review succeeds.

## Acceptance criteria

- Generic evidence unit aliases are available from the shared/data boundary selected by this plan.
- Audit-named exports, storage table, storage row shape, runtime event type, and validator inputs remain compatible.
- Runtime events include a generic payload alias without removing `auditEvidence`.
- Existing audit evidence tests still pass.
- No database migration, artifact/claim persistence, UI timeline work, or destructive rename is introduced.
- Independent `PLAN PASS`, `TEST PASS`, and `REVIEW PASS` gates are recorded.

## Verification plan

Run the focused package tests/builds listed in step 7. If any command fails due unrelated existing worktree drift, capture the exact failure, fix only task-related issues, and report residual unrelated failures rather than widening scope.

## Reusable patterns

- For vocabulary migrations across durable audit/runtime boundaries, introduce generic aliases first, keep durable routing/storage names unchanged, and prove both old and new consumers can read the same payload.
