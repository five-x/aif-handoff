<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

---

memory_id: task::aif-handoff::work::work-20260523-harden-audit-command-query-output-depth::delta
project_id: project::aif-handoff
repo_name: aif-handoff
lane: work
task_id: work-20260523-harden-audit-command-query-output-depth
source_path: docs/rdpi/work/work-20260523-harden-audit-command-query-output-depth
stability: validated
sensitivity: local-only
kind: artifact
project: aif-handoff
entity: aif-handoff
scope: task
updated_at: 2026-05-23
supersedes:
expires_at:
tags:

- aif-handoff
- aif-handoff
- aif-handoff
- work
- task-delta
  source_refs:
- docs/rdpi/work/work-20260523-harden-audit-command-query-output-depth/research.md
- docs/rdpi/work/work-20260523-harden-audit-command-query-output-depth/design.md
- docs/rdpi/work/work-20260523-harden-audit-command-query-output-depth/plan.md
- docs/rdpi/work/work-20260523-harden-audit-command-query-output-depth/result.md
  created_at: 2026-05-23
  last_verified_at: 2026-05-23

---

# Summary

Curated delta for task work-20260523-harden-audit-command-query-output-depth.

# Why it matters

Keeps the reusable task outcome in one reviewable place before publication.

# When to reuse

Reuse this document when checking what was learned from this task.

# When not to reuse

Do not treat task-local implementation details as cross-project guidance unless they were promoted into decisions or patterns.

## Facts

- Search command query terms, command-output labels, shell wrapper text, and search metadata are selectors or descriptors, not observed evidence substance for trusted no-findings depth.
- Search-like ledger evidence must contain risk-substantive `outputPreview` after selector metadata is stripped.
- The validator still preserves trusted no-findings when observed search output contains a risk-substantive result line.

## Decisions

- A stable decision may be worth publishing after close-out: audit risk evidence must distinguish command selectors from observed result bodies; selectors alone do not establish risk-substantive no-findings depth.
- Treat `rg`, `grep`, `git grep`, and `search_files` command/query text as a selector, not as proof of risk-substantive output.
- For self-reported command evidence, a search command can count as risk-substantive only when the reported evidence/output text still contains the risk concept after removing the command/query portion.
- For ledger-backed no-findings evidence, a search-like `AuditEvidenceUnit` can count as risk-substantive only when `outputPreview` contains the risk concept after path-like tokens are stripped. The ledger command itself remains valid provenance, but it is not enough to prove the result body was risk-substantive.
- Preserve non-search substantive commands and existing empty-file proof behavior. Runtime/test commands that naturally prove a risk through output should keep working when their output carries the risk concept.
- Reuse existing `irrelevant_grep_match` and `shallow_evidence` reason codes unless implementation shows a clearer new code is needed. This avoids widening the public diagnostic vocabulary unnecessarily.

## Patterns

- For command-output evidence, validate the observed result body separately from the selector/query. Treat query terms as intent, not as evidence substance.
- For command-output evidence, parse observed result bodies separately from command selectors and prose labels before applying risk-specific evidence-depth matching.
