# Align Source Audit Report Classification

- Task ID: work-20260512-align-source-report-classification
- Lane: work
- Status: done
- Priority: high
- Created: 2026-05-12
- Due: unset
- Source: containment follow-up from audit-v9 final block on inventory-only no-findings reports
- RDPI Needed: yes
- RDPI Path: docs/rdpi/work/work-20260512-align-source-report-classification

## Request

Align source audit report classification with the stricter synthesis semantics so inventory-only `No validated findings` reports fail at source-report validation time instead of reaching final synthesis as valid artifacts.

This is the near-term containment task. It should not wait for the full evidence ledger, but it must move both validators toward one shared classification vocabulary and failure-family model.

## Done When

- Source reports that rely only on `git ls-files`, `git status`, `ls`, `find`, `Get-ChildItem`, file-existence checks, or mass `path:1` citations cannot become trusted no-findings reports.
- `auditReportValidator` and synthesis classification share the same inventory/substantive evidence definitions or call a shared classifier module.
- `roadmap_batch_artifacts` persistence can record precise classification details without relying only on generic `valid`.
- `valid_artifact_count` for audit batches counts only trusted findings or trusted no-findings classifications.
- Current audit-v9 failure shape would classify as inventory-only/insufficient evidence at source-report level, with synthesis not ready.
- Regression coverage proves the final synthesis gate is no longer the first detector for this class.

## Constraints

- Follow RDPI before implementation.
- Do not execute this task during intake.
- Treat this as containment, not as a substitute for the evidence provenance contract.
- Do not weaken existing final synthesis protection.
- Keep legacy markdown support only where it fails closed for weak no-findings claims.

## Notes

- Current `auditReportValidator` accepts substantive evidence from line references plus command-output wording.
- Current `auditSynthesisClassifier` excludes inventory command patterns and marks inventory-only no-findings as inconclusive.
- The immediate bug is the split standard between source-report validation and synthesis classification.

## Links

- Parent architecture intake: work-20260512-audit-evidence-provenance-contract
- Related completed work: ../../rdpi/work/work-20260511-audit-inconclusive-synthesis-gate
