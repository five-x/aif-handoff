# Research: Unblock Direct Audit Canary Planner Routing

## Task framing and lane

- Task ID: `work-20260525-unblock-direct-audit-canary-planner-routing`.
- Lane: `work`.
- Priority: `critical`.
- RDPI required: yes.
- Target branch: `codex/roadmap-audit-oom-hardening`.
- Remote validation target after `PLAN PASS`: `http://192.168.88.67` and `http://192.168.88.67/api`.
- Excluded local dirty file: `docs/kb/windows-codex-bootstrap-validation.md`.
- Goal: direct audit canaries must route as audit/report work, pass deterministic plan quality, reach report generation, and prove fresh negative and positive trusted-artifact outcomes remotely without weakening trust gates.

## Accepted planning sources

- Local `AGENTS.md` and user task text require strict RDPI with independent plan, test, and review gates.
- Local repo state before implementation:
  - branch: `codex/roadmap-audit-oom-hardening`;
  - current HEAD: `09a2ab7dca578e864c03a7938a85f184e428331f`;
  - known pre-existing dirty file: `docs/kb/windows-codex-bootstrap-validation.md`.
- `docs/ops/external-audit-handoff-20260525.md` records that fresh canaries `417342f5-3a96-4af7-8e05-22e8c643bf63` and `44c79a68-60ef-4465-a88c-a6bafbaf9e9b` stopped in planning quality replan loops and did not reach report generation.
- `docs/rdpi/work/work-20260525-improve-audit-report-generation-quality/result.md` records the same blocker with issue codes including `missing_audit_evidence_targets`, `missing_audit_exclusions`, `missing_audit_report_structure`, `audit_without_concrete_boundaries`, and `missing_child_audit_report_decision`.
- `docs/ops/audit-trust-callsite-map-20260525.md` records the trusted-state rule: raw report prose cannot satisfy trusted audit state without manifest, ledger, lifecycle, and committed blob proof.

## Local source facts

- `packages/api/src/routes/tasks.ts` rejects broad direct audit tasks before create, then creates a single task. It does not currently create a persisted report artifact contract for accepted direct audit tasks.
- `packages/agent/src/subagents/planner.ts` and `packages/agent/src/subagents/planChecker.ts` build plan-quality context from `findRoadmapBatchArtifactByTaskId(task.id)`. Direct audit tasks without a roadmap artifact therefore have no `auditArtifactRole=report` in that context.
- `packages/agent/src/subagents/implementer.ts` sets `expectedAuditReportArtifactPath` only when `findRoadmapBatchArtifactByTaskId(taskId)?.role === "report"`. Direct audit tasks without a roadmap artifact route to generic implementer workflow metadata instead of audit/report metadata.
- `packages/agent/src/subagentQuery.ts` passes `allowedWritePaths`, `auditReportArtifactPath`, `auditReportTaskDescription`, `auditReportTaskId`, `auditReportAuditPlanId`, and audit ledger units to the runtime only when workflow metadata contains `auditReportArtifactPath`.
- `packages/shared/src/taskCompletionEvidence.ts` defaults trusted artifact mode only when `roadmapBatchId` is present or `auditArtifactRole` is `report`/`synthesis`. Direct audit tasks without a persisted artifact role fall back to diagnostic trust mode.
- `packages/shared/src/planQuality.ts` can build deterministic diagnostic plans, but its concrete-boundary recognition does not accept root-level files such as `README.md` as concrete audit boundaries. This matches the remote canary issue where README-scoped canaries were classified as missing concrete boundaries.
- `packages/shared/src/auditRoadmapContract.ts` accepts root-level file tokens like `README.md` as audit path tokens and can parse `Scope: README.md`, but `planQuality.ts` does not reuse that path-token rule for concrete plan boundaries.
- `packages/agent/src/coordinator.ts` already updates roadmap artifact state and performs untrusted artifact cleanup when an artifact row exists. Direct audit tasks need an artifact row or equivalent explicit role/path context to use those trusted paths.
- `packages/agent/src/subagents/implementer.ts` already includes strict manifest, ledger, source-scope, no-fabrication, and report-only commit instructions. The missing piece is routing direct canary tasks into that audit/report path.

## Planning quality failure root cause

- Remote task IDs: `417342f5-3a96-4af7-8e05-22e8c643bf63` and `44c79a68-60ef-4465-a88c-a6bafbaf9e9b`.
- Stage: planner / plan-checker quality guard.
- Blocked reason: repeated plan quality feedback before report generation.
- Plan quality issue codes from prior local result docs: `placeholder_plan`, `slash_fallback_echo`, `missing_diagnostic_report_constraints`, `diagnostic_scope_violation`, `missing_audit_evidence_targets`, `missing_audit_exclusions`, `missing_audit_report_structure`, `audit_without_concrete_boundaries`, `missing_child_audit_report_decision`.
- Expected plan shape: deterministic audit/report plan with task intent `audit`, expected `audit/*.md` artifact, declared scope, report-only allowed writes, ledger/manifest/source-snapshot/committed-blob requirements, no source edits, and remote-only validation boundary.
- Actual shape: generic or slash-fallback planner output lacking concrete evidence targets, exclusions, report structure, child-report decision, and sometimes a concrete root-file scope.
- Root cause hypothesis accepted for implementation: direct audit tasks are accepted as task rows but are not materialized as audit/report artifact work, and root-level scope files are not accepted as concrete plan boundaries by `planQuality.ts`.

## Same-project memory

- Shared-memory recall was not used before `PLAN PASS`. The governing RDPI boundary forbids shared-memory recall before plan review unless explicitly waived.

## Cross-project reusable patterns

- No cross-project memory was queried before `PLAN PASS`.
- Reusable local pattern: route trust-sensitive work through persisted, typed artifacts rather than prompt-only conventions.

## Open questions

- Whether the deployed remote service can be patched and rebuilt cleanly during this run, or whether final remote canaries must be recorded as blocked by deployment access.
- Whether the first fresh positive canary should use `README.md` or a small product config/source file. The plan prefers a tiny stable file and will use remote evidence to choose after `PLAN PASS`.

## Hypotheses

- H1: Creating a one-report artifact contract for direct audit tasks at task creation will make planner, plan-checker, implementer, completion evidence, cleanup, and API artifact-trust projections use the existing trusted audit path.
- H2: Accepting root-level scoped files as concrete audit boundaries will allow `README.md` canaries to receive deterministic plans instead of looping in `audit_without_concrete_boundaries`.
- H3: A canary-specific deterministic plan shape can satisfy plan quality without weakening the plan checker.
- H4: Existing trust gates should remain unchanged; the fix should supply missing routing metadata rather than relaxing validation.
