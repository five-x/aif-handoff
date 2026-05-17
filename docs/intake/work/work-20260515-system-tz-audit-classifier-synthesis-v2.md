# System TZ Audit Classifier And Synthesis V2

- Task ID: work-20260515-system-tz-audit-classifier-synthesis-v2
- Lane: work
- Status: queued
- Priority: critical
- Created: 2026-05-15
- Due: after immediate audit report runtime rework boundary is queued or resolved
- Source: `C:\Users\apron\Desktop\aif_handoff_system_tz.md`, sections 8, 23 Phase 3, 25 P0
- RDPI Needed: yes
- RDPI Path: docs/rdpi/work/work-20260515-system-tz-audit-classifier-synthesis-v2

## Request

Unify audit report validation, artifact trust classification, deterministic repair outcomes, and synthesis input selection around one strict classifier model.

Audit source reports must resolve only to `validated_findings_present`, `validated_no_findings`, or `source_inconclusive` as report outcomes, and artifact trust must expose explicit rejected, missing, inconclusive, blocked, manual exception, and failure classifications.

## Done When

- Audit report validator and synthesis gate use the same classification source of truth.
- Manifest v2 validation checks content hash, source snapshot, task/audit plan/batch context, evidence ownership, scope coverage, risk hypothesis coverage, substantive or strong evidence for no-findings, and finding fields.
- Inventory-only, path-only, directory-listing, and self-reported command-output reports are rejected and do not increase trusted valid counts.
- `source_inconclusive` is terminal diagnostic output but not trusted synthesis input.
- Deterministic repair cannot legalize weak reports or route strict manifest reports to free-form model rewrite.
- Every audit failure has a failure family, reason codes, artifact path, and next action.

## Constraints

- Do not weaken existing audit validators.
- Do not accept inventory-only no-findings reports as trusted.
- Do not patch live audit-v16 cards inside this intake task.
- Keep audit diagnostic-only: do not fix findings as part of audit execution.

## Notes

- Closely related to `work-20260515-harden-audit-report-runtime-rework`; this card is the platform classifier/synthesis slice, while that card is the immediate runtime rework boundary.
