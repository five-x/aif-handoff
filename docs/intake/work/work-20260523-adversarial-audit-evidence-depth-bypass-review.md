# Adversarial Audit Evidence Depth Bypass Review

- Task ID: work-20260523-adversarial-audit-evidence-depth-bypass-review
- Lane: work
- Status: queued
- Priority: critical
- Created: 2026-05-23
- Due: after `work-20260522-harden-audit-evidence-depth-gates`
- Source: Follow-up from `work-20260522-harden-audit-evidence-depth-gates` closeout and operator request to queue additional hardening work.
- RDPI Needed: yes
- RDPI Path: `docs/rdpi/work/work-20260523-adversarial-audit-evidence-depth-bypass-review`

## Request

Run an independent adversarial review of the audit evidence-depth gate and try to find remaining ways to promote shallow no-findings evidence to trusted `validated_no_findings`.

Focus on bypass attempts around mixed claims, no-risk scoped claims, path-only risk term matches, generic or quoted dot-grep variants, reused snippets, ledger evidence that is identity-bound but not risk-substantive, command-output-shaped prose, and risk wording that leaks across adjacent line segments.

## Done When

- The review enumerates each bypass class attempted and whether it passes or fails.
- Any confirmed bypass has a separate queued implementation task with exact reproduction steps and expected classification.
- Any test-only gap has a separate queued corpus/test task or is attached to the existing evidence-depth corpus task.
- The review does not change production code.

## Constraints

- Diagnostic only. Do not implement fixes in this task.
- Do not weaken manifest, source snapshot, content hash, artifact path, ledger identity, scope membership, or synthesis membership checks.
- Do not make no-findings impossible; preserve pragmatic substantive evidence acceptance.

## Verification Plan

- Focused source review of `packages/shared/src/auditReportValidator.ts`, `packages/shared/src/auditSourceEvidence.ts`, and existing evidence-depth tests.
- Constructed report/manifest/ledger examples for attempted bypasses.
- Independent REVIEW verdict before closeout.
