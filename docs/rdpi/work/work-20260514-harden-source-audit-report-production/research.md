# Research

## Task framing and lane

- Task: `work-20260514-harden-source-audit-report-production`.
- Lane: `work`.
- Intake card: `docs/intake/work/work-20260514-harden-source-audit-report-production.md`.
- RDPI path: `docs/rdpi/work/work-20260514-harden-source-audit-report-production`.
- User request: run the queued task "Harden Source Audit Report Production".
- RDPI needed: yes.

## Accepted planning sources or local facts

- `AGENTS.md` and the task-scoped prompt require RDPI, independent plan/test/review gates, and no implementation before `PLAN PASS`.
- `$runtask` preflight command `codex-ensure-rdpi.py` returned `STATUS: ready`.
- `codex-flow-audit.py --repo .` returned `STATUS: clean`.
- The intake card requires source audit cards to end as one of the operationally clear outcomes: trusted valid report, invalid report with validator issues, missing report artifact, malformed report artifact, or source inconclusive after exhausted local rework.
- Current audit artifact vocabulary has states for `valid`, `invalid`, `missing`, `source_inconclusive`, `terminal_inconclusive`, and related families in `packages/shared/src/auditRoadmapContract.ts`.
- `packages/shared/src/taskCompletionEvidence.ts` already detects `missing_report_artifact` for risky audit tasks when the expected artifact path is absent from changed report artifacts.
- `packages/shared/src/auditReportValidator.ts` already validates manifest identity/hash/snapshot, missing file references, invalid line references, scope coverage, and substantive evidence classification.
- `packages/agent/src/coordinator.ts` routes failed audit completion evidence through artifact attempts, rework requests, and terminal source-inconclusive paths.
- Static explorer finding: `terminalizeRoadmapSourceReportAsInconclusive` currently records broad `source_inconclusive` metadata even when the declared report artifact cannot be read and the content SHA is `null`.
- Static explorer finding: there is no first-class validator issue for literal escaped-newline or single-line malformed markdown reports.
- Static explorer finding: deterministic report repair already writes joined markdown, but targeted regression coverage for escaped-newline report blobs is missing.
- Existing worktree is dirty with unrelated in-progress changes; implementation must touch only files needed for this task and preserve unrelated edits.

## Same-project memory

- Not queried before `PLAN PASS` because the repo RDPI contract forbids shared-memory recall during the pre-plan boundary unless explicitly waived.
- Same-project memory may be useful after implementation only for memsync, if this task produces stable reusable audit-report hardening knowledge.

## Cross-project reusable patterns

- Not queried before `PLAN PASS` for the same boundary reason.
- Local reusable pattern already present in instructions: keep artifact states structured and fail closed when evidence is missing, malformed, or untrusted.

## Rejected or stale memory candidates

- None evaluated. No memory candidates were queried before the plan gate.

## Open questions

- Whether to add a new artifact state/failure family for malformed reports or model malformed artifacts as `invalid` with a first-class `malformed_report_artifact` issue code.
- Whether missing declared report files during terminal source-inconclusive handling should switch artifact state to `missing`, or preserve `source_inconclusive` while embedding `missing_report_artifact` diagnostics.
- Which focused test subset is sufficient before full package verification.

## Hypotheses

- Adding a `malformed_report_artifact` validator issue and mapping it to `invalid_artifact_content` will satisfy the "malformed report artifact" outcome without a schema migration.
- Recording missing report diagnostics in terminal source-inconclusive validation details will preserve synthesis/operator context without weakening the existing source-inconclusive terminal state.
- Focused tests across shared validator/evidence, data artifact state, and agent coordinator/implementer will cover the requested failure classes.
