# Audit Synthesis Trust Propagation Review

- Task ID: work-20260523-audit-synthesis-trust-propagation-review
- Lane: work
- Status: queued
- Priority: critical
- Created: 2026-05-23
- Due: after `work-20260522-harden-audit-evidence-depth-gates`
- Source: Follow-up from `work-20260522-harden-audit-evidence-depth-gates` closeout and operator request to queue additional hardening work.
- RDPI Needed: yes
- RDPI Path: `docs/rdpi/work/work-20260523-audit-synthesis-trust-propagation-review`

## Request

Review the downstream trust propagation paths and prove that shallow or `source_inconclusive` source reports cannot be promoted back into trusted no-findings through synthesis, task completion evidence, roadmap artifact counts, workflow timeline projections, deterministic repair, or review handoff.

## Done When

- All paths from source report validation to synthesis/API/timeline/review trust state are mapped.
- Missing or stale `evidenceDepth` validation details are confirmed to fail closed for no-findings trust.
- Ledger-backed source reports remain trusted only when their original substantive evidence units are available and risk-bound.
- Any promotion path from shallow or inconclusive source evidence to trusted no-findings has a separate queued implementation task.
- The review does not change production code.

## Constraints

- Diagnostic only. Do not implement fixes in this task.
- Preserve public audit outcome vocabulary: `validated_findings_present`, `validated_no_findings`, and `source_inconclusive`.
- Do not weaken existing manifest and membership checks.

## Verification Plan

- Review `packages/shared/src/auditSynthesisClassifier.ts`, `packages/shared/src/taskCompletionEvidence.ts`, `packages/data/src/index.ts`, and relevant agent review/repair call sites.
- Use focused fixtures or constructed examples to check fail-closed propagation.
- Independent REVIEW verdict before closeout.
