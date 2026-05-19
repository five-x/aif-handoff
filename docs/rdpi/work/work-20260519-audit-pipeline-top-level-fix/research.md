# Research

## Task framing and lane

- Task id: `work-20260519-audit-pipeline-top-level-fix`
- Lane: `work`
- User request: identify and fix the top-level reason audit batches repeatedly produce red cards instead of treating each card as an isolated bug.
- Runtime observation from the preceding `audit-v17` run: the batch created 7 cards, but only 2 source reports reached trusted `closed_verified`; 3 source reports became `blocked_external/source_inconclusive`, 1 source report timed out in `qwen-local-agent` at max tool turns, and synthesis stayed `synthesis_not_ready`.

## Accepted planning sources or local facts

- RDPI preflight passed with `STATUS: ready`.
- Local working tree already had unrelated user changes in `docs/kb/windows-codex-bootstrap-validation.md`; this task will not touch that file.
- `packages/api/src/routes/tasks.ts` has direct audit-task decomposition protection for broad audit requests, but imported/generated roadmap cards can still become executable audit cards.
- `packages/api/src/services/roadmapGeneration.ts` builds deterministic audit fallback cards when model-generated audit roadmap content fails validation.
- `packages/api/src/services/roadmapGeneration.ts` currently builds deterministic fallback risks as generic text: "owner-area defects that produce actionable audit findings".
- `packages/api/src/services/roadmapGeneration.ts` currently chooses scopes from existing filesystem paths, including broad directories, hidden generated config paths, and untracked runtime directories when they exist.
- `packages/agent/src/subagents/implementer.ts` decides whether first-run deterministic audit report generation is possible with `hasReadableDeclaredAuditScope()`.
- `packages/agent/src/subagents/implementer.ts` falls through to the runtime implementer when an expected audit report card is not locally repairable.
- `packages/agent/src/subagents/implementer.ts` deterministic audit report repair uses scoped file/path evidence and report manifests, then strict validation decides whether the report is trusted.
- `packages/shared/src/auditReportValidator.ts` correctly rejects reports with missing repository references, irrelevant hidden/generated evidence, missing declared scope roots, and missing scope coverage.
- `packages/runtime/src/adapters/qwenLocalAgent/api.ts` raises `qwen-local-agent exceeded max tool turns (...)` when broad runtime execution loops through too many tool calls.

## Same-project local history

- `docs/rdpi/work/work-20260514-harden-source-audit-report-production/result.md` records prior hardening that made invalid audit reports fail closed instead of silently passing.
- `docs/rdpi/work/work-20260515-harden-audit-report-runtime-rework/result.md` records the decision to terminalize strict deterministic audit report failures as `source_inconclusive` instead of falling through to free-form runtime repair.
- `docs/rdpi/work/work-20260517-wire-audit-card-decision-output/result.md` records the accepted `auditCardDecision` output path. The V17 run confirmed this path works for trusted reports: accepted source reports expose `finalStatus=closed_verified`.

## Same-project memory

- Shared-memory recall was not used before `PLAN PASS` because the active project RDPI contract forbids shared-memory recall before plan pass unless explicitly waived. Local docs and repo files were sufficient for planning.

## Cross-project reusable patterns

- None used before `PLAN PASS`.

## Rejected or stale memory candidates

- The prior `auditCardDecision` work is not the root cause of the current red cards. It is functioning for accepted reports; the failure now occurs earlier, while generating executable audit source cards and their evidence.

## Working diagnosis

The top-level problem is a contract mismatch across three layers:

1. Roadmap generation asks for owner-grade audit decomposition, but deterministic fallback emits broad, mixed-quality source scopes and generic risk hypotheses.
2. Deterministic report generation assumes those source scopes are concrete, tracked, readable, and validator-compatible.
3. The validator correctly rejects reports whose scopes/evidence do not meet the strict contract. If the card is not locally repairable, the implementer falls through to Qwen and can burn tool turns instead of failing fast with a deterministic diagnostic.

The fix should move the guarantee earlier: generated audit source cards must be deterministic-repairable before they enter the queue, and non-repairable audit report cards must not fall through to free-form runtime execution.
