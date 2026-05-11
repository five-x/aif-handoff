# Research - Shared Audit Report Contract Validator

## Task framing and lane

- Task ID: `work-20260511-audit-report-contract-validator`
- Lane: `work`
- Intake card: `docs/intake/work/work-20260511-audit-report-contract-validator.md`
- RDPI path: `docs/rdpi/work/work-20260511-audit-report-contract-validator`
- User intent: execute the queued task that builds a shared audit report artifact validator and migrates completion evidence to use typed validator issues.
- Scope: platform-level `aif-handoff` implementation. Do not special-case a canary project and do not execute child follow-up tasks in this run.
- Boundary: planning phase only before `PLAN PASS`; no live runtime/service/log/shared-memory probing was performed.

## Accepted planning sources or local facts

- RDPI preflight returned `STATUS: ready`.
- Flow audit returned `STATUS: clean` with no routing or gate hazards.
- Parent analysis in `docs/rdpi/work/work-20260511-audit-quality-system-analysis/` identified the failure model: weak audit report validation is scattered across prompts and narrow regexes, allowing placeholder git output, contradictory findings plus `No Validated Findings`, governance/documentation observations as technical findings, speculative claims, and fake command output.
- The task is the first child from that parent analysis. Later child cards cover scope coverage, rework freshness, review-gate unification, and full batch integration; this run should not absorb those full scopes.
- `packages/shared/src/taskCompletionEvidence.ts` is the current deterministic completion guard. It already returns typed `TaskCompletionIssueCode` values and exposes report evidence details, but report content validation is embedded as local helper logic and regex pattern lists.
- `packages/shared/src/auditRoadmapContract.ts` owns audit artifact roles/states/failure families and maps completion evidence issue codes to audit failure families.
- `packages/agent/src/reviewGate.ts` already imports `evaluateTaskCompletionEvidence()` and `hasSubstantiveReportEvidence()`. Its acceptance path can therefore benefit from a shared validator through completion evidence without a full review-gate redesign in this task.
- `packages/api/src/services/taskEvents.ts` runs completion evidence on `start_implementation` and `approve_done`, maps issue codes to roadmap failure families, returns recoverable audit failures to rework, and stores issues/evidence in roadmap artifact validation details.
- `packages/agent/src/coordinator.ts` runs the same completion evidence path when review completes and updates roadmap batch artifact state.
- Existing tests already cover placeholder `123abc`, long synthetic hashes, false missing paths, speculative claims, valid no-findings reports, expected report paths, and report-only delta behavior in `packages/shared/src/__tests__/taskCompletionEvidence.test.ts`.
- The observed bad report class is not fully covered: short numeric git output such as `1234567 (HEAD -> main)`, mixed finding/no-finding semantics, and governance/documentation claims with concrete doc citations can still fit the current structural evidence shape.
- Independent static research confirmed the implementation touch points above and identified likely thin integration assertions in shared completion evidence, agent review gate/coordinator, and API approve/artifact tests.

## Same-project memory

- Shared memory was not consulted before `PLAN PASS` because the RDPI boundary forbids shared-memory recall during planning unless explicitly waived.
- Local intake, parent RDPI artifacts, and current source files were sufficient for planning.

## Cross-project reusable patterns

- None accepted. This is a local platform contract change.

## Rejected or stale memory candidates

- No memory candidates were queried.

## Implementation hypotheses

- A new shared module, likely `packages/shared/src/auditReportValidator.ts`, should own report-content issue codes and validation helpers.
- `taskCompletionEvidence.ts` should call the shared validator and continue emitting existing completion issue code `low_quality_report_evidence` so existing failure-family mapping and artifact state behavior remain stable.
- The validator should expose typed report-level issue codes for downstream details, while completion evidence remains the compatibility wrapper used by approve flow, coordinator, review gate, and batch artifact state.
- Focused tests should include a direct bad-report fixture and positive fixtures for valid no-findings and valid finding reports.
