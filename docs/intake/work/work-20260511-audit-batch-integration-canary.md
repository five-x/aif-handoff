# Audit Batch Integration Canary

- Task ID: work-20260511-audit-batch-integration-canary
- Lane: work
- Status: done
- Priority: high
- Created: 2026-05-11
- Due: unset
- Source: follow-up from `work-20260511-audit-quality-system-analysis`
- RDPI Needed: yes
- RDPI Path: docs/rdpi/work/work-20260511-audit-batch-integration-canary

## Request

Add deterministic or mocked integration coverage for the typed audit batch lifecycle so the platform catches the audit-v7 first-card failure class before live testing.

## Done When

- Integration coverage exercises weak report -> invalid/rework-needed.
- Manual `request_changes` forces actual rework or blocks with an actionable freshness reason.
- Valid report artifact marks the batch source valid.
- Synthesis waits until source artifacts are terminal and consumes only validated report findings.
- The test would have caught the observed bad report: synthetic git output, mixed findings/no-findings, doc-only weak findings, and skipped rework.
- Local-vs-external usage semantics are covered: local runtimes may record tokens without paid cost gating; external runtimes remain usage/cost accounted and budget-aware.

## Constraints

- Do not depend on a live Qwen model as the only proof.
- No canary-project-specific source paths in assertions.
- Prefer deterministic fixtures or mocked tool-capable runtime behavior.

## Links

- Parent analysis: ../../rdpi/work/work-20260511-audit-quality-system-analysis
