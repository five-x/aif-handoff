# Deterministic Audit Repair Emits Source Inconclusive

- Task ID: work-20260513-deterministic-audit-repair-source-inconclusive
- Lane: work
- Status: done
- Priority: critical
- Created: 2026-05-13
- Due: unset
- Source: audit-v10 quality review
- RDPI Needed: yes
- RDPI Path: docs/rdpi/work/work-20260513-deterministic-audit-repair-source-inconclusive

## Request

Change deterministic audit report repair so it cannot manufacture a successful `validated_no_findings` source report from generic scoped evidence. When the runtime cannot repair a weak audit report with risk-specific, product-scope evidence, it must emit or persist `source_inconclusive` or another non-trusted state.

## Done When

- `runDeterministicAuditReportRepair` no longer writes manifests with unconditional `outcome: "validated_no_findings"`.
- Deterministic repair never upgrades insufficient evidence into a trusted no-findings conclusion.
- Broad scope fallback does not select arbitrary first files under the repository root.
- Hidden agent/tooling files such as `.agents/**` and `.ai-factory/**` cannot satisfy product audit no-findings evidence unless the task explicitly scopes those files.
- Repaired reports with insufficient evidence transition to rework or source-inconclusive lifecycle states and do not increment trusted valid counts.
- Tests cover deterministic repair on a repo where first text files are `.agents/**`.

## Constraints

- Follow RDPI before implementation.
- Do not execute this task during intake.
- Preserve safe deterministic repairs such as manifest normalization and report-path metadata repair.
- Do not remove existing artifact attempt/history behavior.

## Notes

- Current implementation builds a deterministic report with `No validated findings`, `riskHypotheses: []`, and `noFindingsClaims` from selected files.
- In botIntevra audit-v10, the selected files were agent skill metadata, not bot source.

## Links

- Related intake: work-20260513-audit-roadmap-explicit-scope-risk-contract
- Related intake: work-20260513-audit-v10-false-valid-regression
