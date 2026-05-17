# Plan

## Implementation plan

1. Update `packages/agent/src/subagents/implementer.ts`.
   - Remove `runtime_rework_required` as a deterministic audit report repair result status.
   - Replace unresolved post-repair validator failures with `terminalizeSourceInconclusiveAuditReport()`.
   - Replace repeated deterministic repair runtime fallback with immediate terminal source-inconclusive handling and an early return.
   - Keep exact validator issue codes, artifact path, and deterministic repair reasons in implementation log, blocked reason, artifact validation details, and activity log.

2. Update review-gate strict blocker handling if current deterministic findings can still be bypassed by resolved prose.
   - Treat previous blocker IDs/text for strict audit report validator issues as unresolved when current deterministic findings still contain those issue codes.
   - Keep existing exact-ID structured review behavior for non-strict findings.

3. Update regression tests.
   - Flip repeated deterministic repair tests so `queryMock` is not called and the task becomes `blocked_external`/`source_inconclusive`.
   - Add or extend an audit-v16-shaped fixture covering malformed manifest JSON, placeholder hash/snapshot, inventory-only evidence, repeated runtime rewrite pressure, and reviewer claiming `resolved`.
   - Add review-gate coverage proving strict validator blocker IDs cannot be closed by reviewer prose without validator-valid evidence.
   - Add/adjust auto-queue or data assertions proving terminal invalid/source-inconclusive source artifacts do not become trusted successful synthesis input.

4. Run targeted verification.
   - `npm.cmd test --workspace=@aif/agent -- src/__tests__/implementer.test.ts`
   - `npm.cmd test --workspace=@aif/agent -- src/__tests__/reviewGate.test.ts`
   - `npm.cmd test --workspace=@aif/agent -- src/__tests__/autoQueue.test.ts`
   - `npm.cmd test --workspace=@aif/data -- src/__tests__/index.test.ts`
   - `npm.cmd test --workspace=@aif/shared -- src/__tests__/auditReportValidator.test.ts src/__tests__/taskCompletionEvidence.test.ts`
   - `npm.cmd run lint --workspace=@aif/agent`
   - `npm.cmd run build --workspace=@aif/agent`
   - `git diff --check`

5. Close RDPI after gates.
   - Require independent `PLAN PASS` before edits.
   - Require independent `TEST PASS` after implementation.
   - Require independent `REVIEW PASS` after tests.
   - Record `result.md`, run `$memsync MODE=auto LANE=work TASK_ID=work-20260515-harden-audit-report-runtime-rework`, then update only this task in `docs/intake/work_status.json`.

## Acceptance criteria

- Strict audit report artifacts cannot route to free-form runtime/model rework after deterministic repair fails validator requirements.
- Deterministic repair emits structured valid manifests or terminal `source_inconclusive`; no placeholder hash/snapshot or malformed manifest can be accepted.
- Inventory-only evidence cannot produce trusted no-findings.
- Reviewer `resolved` prose cannot close strict validator blocker IDs without validator-valid evidence.
- Auto-queue/synthesis behavior remains fail-closed for blocked or terminal invalid source artifacts.
