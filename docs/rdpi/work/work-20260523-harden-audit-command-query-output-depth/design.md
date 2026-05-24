# Design

## Chosen design

Add a narrow evidence-depth hardening layer for search-shaped risk evidence:

1. Treat `rg`, `grep`, `git grep`, and `search_files` command/query text as a selector, not as proof of risk-substantive output.
2. For self-reported command evidence, a search command can count as risk-substantive only when the reported evidence/output text still contains the risk concept after removing the command/query portion.
3. For ledger-backed no-findings evidence, a search-like `AuditEvidenceUnit` can count as risk-substantive only when `outputPreview` contains the risk concept after path-like tokens are stripped. The ledger command itself remains valid provenance, but it is not enough to prove the result body was risk-substantive.
4. Preserve non-search substantive commands and existing empty-file proof behavior. Runtime/test commands that naturally prove a risk through output should keep working when their output carries the risk concept.
5. Reuse existing `irrelevant_grep_match` and `shallow_evidence` reason codes unless implementation shows a clearer new code is needed. This avoids widening the public diagnostic vocabulary unnecessarily.

This design keeps existing identity and provenance checks intact. It only reduces when a no-findings report is allowed to become trusted.

## Pre-PLAN boundary

- Allowed before `PLAN PASS`: read intake, repo instructions, source files, tests, local docs, and existing RDPI artifacts; write planning-only `research.md`, `design.md`, and `plan.md`; run independent plan review.
- Not allowed before `PLAN PASS`: code edits, test runs, live/runtime evidence gathering, host/service/log/scheduler probing, or shared-memory recall.

## Decision candidates

- A stable decision may be worth publishing after close-out: audit risk evidence must distinguish command selectors from observed result bodies; selectors alone do not establish risk-substantive no-findings depth.
