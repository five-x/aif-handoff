<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

---

memory_id: task::aif-handoff::work::work-20260513-audit-roadmap-explicit-scope-risk-contract::hypotheses
project_id: project::aif-handoff
repo_name: aif-handoff
lane: work
task_id: work-20260513-audit-roadmap-explicit-scope-risk-contract
source_path: docs/rdpi/work/work-20260513-audit-roadmap-explicit-scope-risk-contract
stability: draft
sensitivity: forbidden
kind: hypothesis
project: aif-handoff
entity: aif-handoff
scope: task
updated_at: 2026-05-13
supersedes:
expires_at:
tags:

- aif-handoff
- aif-handoff
- aif-handoff
- work
- hypothesis
  source_refs:
- docs/rdpi/work/work-20260513-audit-roadmap-explicit-scope-risk-contract/research.md
- docs/rdpi/work/work-20260513-audit-roadmap-explicit-scope-risk-contract/design.md
- docs/rdpi/work/work-20260513-audit-roadmap-explicit-scope-risk-contract/plan.md
- docs/rdpi/work/work-20260513-audit-roadmap-explicit-scope-risk-contract/result.md
  created_at: 2026-05-13
  last_verified_at: 2026-05-13

---

# Summary

Local-only hypotheses collected during task work-20260513-audit-roadmap-explicit-scope-risk-contract.

# Why it matters

Preserves open questions for follow-up without promoting them into shared memory.

# When to reuse

Reuse only while the task is still active or under review.

# When not to reuse

Do not publish or treat these hypotheses as validated facts.

## Hypotheses

- The smallest compatible risk-hypothesis format is a `Risk hypotheses:` line containing entries like `risk-architecture-scope covers README.md, package.json: boundary or ownership drift...`.
- A shared parser/validator in `auditRoadmapContract.ts` can make both source roadmap validation and generated task validation fail closed without duplicating logic in the API service.
- Synthesis cards should be exempt from product scope and risk hypothesis requirements, but should be explicitly checked for report-batch scope so source-report scope and product audit scope remain separate.
- Deterministic fallback generation should never return `Scope: .`; if no preferred source roots exist, it should use concrete existing repo files such as `README.md`, `AGENTS.md`, `package.json`, project config files, or explicitly named directories.
