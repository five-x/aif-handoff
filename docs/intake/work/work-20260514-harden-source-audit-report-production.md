# Harden Source Audit Report Production

- Task ID: work-20260514-harden-source-audit-report-production
- Lane: work
- Status: done
- Priority: critical
- Created: 2026-05-14
- Due: unset
- Source: live `audit-v14` source report review after final synthesis block
- RDPI Needed: yes
- RDPI Path: docs/rdpi/work/work-20260514-harden-source-audit-report-production

## Request

Make generated source audit cards produce either a real, readable, evidence-bearing report artifact or a structured terminal inconclusive artifact. A source card must not become operationally ambiguous: `done` with no report file, a rejected report, or a placeholder/no-findings report must carry enough structured data for synthesis and operators to understand what happened.

## Problem Statement

`audit-v14` source cards exposed several next-failure classes:

- security and performance cards ended as `done/source_inconclusive`, but their report artifact files were not committed on their feature branches;
- architecture report cited non-existing files (`src/bot_intevra/main.py`, `src/bot_intevra/utils.py`) and still claimed no findings;
- persistence and integration reports were written as a single physical line with literal `\n`, making line-based evidence and review unreliable;
- test/ops report checked only a small subset of tests while claiming no validated findings for readiness;
- several reports used placeholder manifest values, invalid commands, inventory-only checks, or speculative claims.

## Done When

- Source audit execution distinguishes these outcomes with first-class structured states:
  - valid trusted report;
  - invalid report with concrete validator issues;
  - missing report artifact;
  - malformed report artifact;
  - source inconclusive after exhausted local rework.
- Missing report artifact after a runtime attempt does not silently become a generic `source_inconclusive`; it records `missing_report_artifact` or equivalent diagnostics in artifact metadata and attempt history.
- The runtime never treats plan text as the report artifact.
- Deterministic repair or fallback writes readable markdown with real newlines, not escaped literal `\n` blobs.
- Validation rejects reports that:
  - cite files that do not exist in the audited snapshot;
  - cite line ranges outside the file;
  - use placeholder content SHA, source snapshot, or manifest fields;
  - claim no-findings from file existence, `git ls-files`, `ls`, broad grep, or inventory-only evidence;
  - include invalid verification commands such as `cat file:1-2`;
  - omit commands and observed outputs for no-findings claims.
- Rework loops receive the concrete validator issue set and the exact missing/invalid fields, not only a broad "source_inconclusive" label.
- Tests cover source report absence, malformed escaped-newline reports, invalid file references, invalid line references, placeholder manifests, inventory-only no-findings, and successful substantive no-findings.

## Forward-Looking Guardrails

- Assume the next failure will be a syntactically valid but substantively empty report. Add regression fixtures for "looks structured, proves nothing".
- Assume the following failure will be branch/worktree visibility: the report exists on a feature branch but synthesis cannot read it. Add tests for branch metadata and content retrieval.
- Assume model output will put the report content into the plan file or activity log. Add a guard that only the declared report artifact path counts.
- Keep terminal inconclusive source artifacts useful: include reason codes, attempted report path, branch/worktree, content SHA when present, and last validator result.

## Constraints

- Follow RDPI before implementation.
- Do not execute this task during intake.
- Do not weaken audit report validation.
- Do not make invalid reports pass just to unblock synthesis.
- Do not require manual database patching for normal recovery.
- Preserve non-audit task behavior unless a shared artifact mechanism is intentionally introduced.

## Notes

- The live security task had plan text with findings but no report artifact file in `git ls-tree`.
- The live performance task terminalized after plan-quality exhaustion with no evidence and no report artifact.
- The live persistence and integration reports had physical line count `1` because escaped newlines were written as text.
- The live test/ops report cited only three tests while the project contains eighteen tracked test files.

## Links

- Related code: packages/shared/src/auditReportValidator.ts
- Related code: packages/shared/src/taskCompletionEvidence.ts
- Related code: packages/agent/src/coordinator.ts
- Related prior task: work-20260513-make-audit-report-rework-deterministic-until-valid
- Related prior task: work-20260513-deterministic-audit-repair-source-inconclusive
