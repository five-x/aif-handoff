# Design

## Chosen design

Make deterministic audit report repair fail closed inside `packages/agent/src/subagents/implementer.ts`.

For strict roadmap report artifacts, deterministic repair has only two terminal outcomes:

- strict validator-valid report artifact, persisted as trusted `valid` with validator details;
- terminal non-trusted `source_inconclusive`, persisted with exact validator issue codes, artifact path, source snapshot/content hash details when available, and task `blocked_external`.

Runtime/model implementation must not receive a second chance to hand-author or patch a strict `audit-report-manifest` after deterministic repair cannot satisfy the validator.

## Detailed approach

- Replace the `runtime_rework_required` deterministic repair outcome with terminal source-inconclusive handling.
- Change `runDeterministicAuditReportRepair()` so unresolved strict validation after the deterministic write calls `terminalizeSourceInconclusiveAuditReport()` instead of `persistDeterministicAuditRepairRuntimeRework()`.
- Change the repeated deterministic repair branch in `runImplementer()` so it terminalizes immediately using the current validator result and issue codes, then returns before runtime prompt construction.
- Preserve diagnostics:
  - artifact path;
  - exact validator issue codes and messages;
  - deterministic repair reasons;
  - source snapshot/content SHA when validator output has them;
  - existing auto-review finding IDs where available.
- Remove or retire runtime-rework prompt language for strict audit report deterministic repair. Audit evidence repair mode can remain for non-strict or pre-deterministic report repair only if the guarded path cannot be reached after deterministic failure.
- Strengthen review-gate closure for strict audit validator previous blockers so reviewer prose cannot mark `invalid_report_manifest`, `missing_scope_coverage`, `missing_substantive_evidence`, or deterministic repair blockers resolved while the current deterministic validator still reports them.
- Preserve data-layer trusted-success semantics: `source_inconclusive` may be terminal accounting, but it must not increment trusted valid counts or produce successful no-findings synthesis input.

## Non-goals

- Do not weaken `packages/shared/src/auditReportValidator.ts`.
- Do not introduce new database artifact states.
- Do not patch live audit-v16 task cards or create/execute child implementation tasks.
- Do not add shared-memory publication before RDPI close-out.

## Risks

- Some tests intentionally expecting runtime fallback must be inverted; targeted assertions need to prove no runtime query occurs.
- Terminalizing strict reports as `source_inconclusive` must still leave enough diagnostics for operators to see why the report could not be trusted.
- Synthesis readiness tests need careful wording: terminal inconclusive accounting is allowed only as non-trusted input, never as a successful trusted no-findings result.
