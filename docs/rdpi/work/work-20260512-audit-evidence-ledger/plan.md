# Plan: Audit Evidence Ledger

## Implementation plan

1. Add shared audit evidence types and helpers in `packages/shared/src/auditEvidenceLedger.ts`, including scope ID and risk hypothesis ID normalization.
2. Add `audit_evidence_events` to `packages/shared/src/schema.ts`, `packages/shared/src/db.ts`, and exported shared types, including JSON columns for `scopeIds` and `riskHypothesisIds`.
3. Add data-layer append/list/query helpers in `packages/data/src/index.ts`, including lookup by task, audit plan, source snapshot, and evidence IDs.
4. Add agent capture plumbing that persists `audit:evidence` runtime events and Claude PostToolUse-derived ledger units without writing raw outputs to `agentActivityLog`.
5. Add Qwen local agent evidence events for `read_file`, `list_files`, `run_shell`, and `git_status`, with hashes and bounded redacted previews.
6. Extend `validateAuditReportArtifact` so manifest evidence refs can be verified against provided ledger units for task, audit plan, source snapshot, grade, scope IDs, and risk hypothesis IDs.
7. Extend `TaskCompletionEvidenceInput` with optional ledger evidence and update agent/API production call sites that evaluate audit report artifacts to query and pass ledger context.
8. Add focused tests for evidence normalization/redaction, DB persistence, runtime event emission, agent persistence, manifest evidence verification, and the production completion path rejecting fake command-shaped markdown without matching ledger evidence.
9. Run lint/build/tests relevant to changed packages.
10. Write `result.md`, memory review artifacts, and update the matching intake status only after TEST/REVIEW gates pass.

## Acceptance criteria

- Runtime/tool activity can emit audit evidence events for file read, search/listing, and shell command inspection.
- Inventory commands are persisted as `discovery` evidence and rejected as support for ledger-backed no-findings.
- Shell/search/read outputs are stored only as hashes, bounded redacted previews, and parsed summaries.
- Secret-like output is redacted in previews and covered by tests.
- Manifest evidence IDs can be checked against task ID, audit plan ID, source snapshot ID, scope IDs, and risk hypothesis IDs.
- A report with command-shaped markdown but missing/wrong ledger IDs fails ledger-backed validation.
- Production audit completion/artifact validation passes ledger context instead of relying only on markdown text.
- Existing activity logging continues to avoid raw response payload persistence.

## Verification plan

- `npm.cmd run test --workspace=@aif/shared -- src/__tests__/auditEvidenceLedger.test.ts src/__tests__/auditReportValidator.test.ts src/__tests__/taskCompletionEvidence.test.ts`
- `npm.cmd run test --workspace=@aif/data -- src/__tests__/auditEvidenceLedger.test.ts src/__tests__/index.test.ts`
- `npm.cmd run test --workspace=@aif/runtime -- src/__tests__/qwenLocalAgent.test.ts src/__tests__/toolEvents.test.ts`
- `npm.cmd run test --workspace=@aif/agent -- src/__tests__/hooks.test.ts src/__tests__/coordinator.test.ts src/__tests__/reviewGate.test.ts`
- `npm.cmd run lint --workspace=@aif/shared`
- `npm.cmd run lint --workspace=@aif/data`
- `npm.cmd run lint --workspace=@aif/runtime`
- `npm.cmd run lint --workspace=@aif/agent`
- `npm.cmd run build`
- Independent `TEST PASS` gate after implementation.
- Independent `REVIEW PASS` gate after tests.

## Reusable patterns

- Use `redactProviderText` before persisting previews.
- Store raw output hashes separately from previews so reviewers can detect changed observations without reading unsafe payloads.
- Treat missing ledger context as compatibility mode, not provenance trust.
