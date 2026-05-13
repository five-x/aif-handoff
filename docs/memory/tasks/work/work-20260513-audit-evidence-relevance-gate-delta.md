<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

---

memory_id: task::aif-handoff::work::work-20260513-audit-evidence-relevance-gate::delta
project_id: project::aif-handoff
repo_name: aif-handoff
lane: work
task_id: work-20260513-audit-evidence-relevance-gate
source_path: docs/rdpi/work/work-20260513-audit-evidence-relevance-gate
stability: validated
sensitivity: local-only
kind: artifact
project: aif-handoff
entity: aif-handoff
scope: task
updated_at: 2026-05-13
supersedes:
expires_at:
tags:

- aif-handoff
- work
- task-delta
- audit-validator
- evidence-relevance
  source_refs:
- docs/rdpi/work/work-20260513-audit-evidence-relevance-gate/research.md
- docs/rdpi/work/work-20260513-audit-evidence-relevance-gate/design.md
- docs/rdpi/work/work-20260513-audit-evidence-relevance-gate/plan.md
- docs/rdpi/work/work-20260513-audit-evidence-relevance-gate/result.md
  created_at: 2026-05-13
  last_verified_at: 2026-05-13

---

# Summary

Curated delta for task `work-20260513-audit-evidence-relevance-gate`.

# Why it matters

This task closed an audit-validator gap where trusted audit reports could cite irrelevant or metadata-only lines and still appear validated.

# When to reuse

Reuse this when maintaining audit report validation, source evidence classification, or audit roadmap failure routing in `aif-handoff`.

# When not to reuse

Do not treat these project-specific validator issue names or fixture shapes as cross-project guidance without first checking the local audit contract in the target repository.

## Facts

- Trusted no-findings audit reports now require concrete scoped risk or absence claims rather than generic no-findings prose.
- Manifest evidence scope/risk relevance validation now applies to findings-present and no-findings trusted claims.
- Hidden, generated, and report artifact paths do not count as product evidence unless directly scoped by the audit mandate.
- Metadata-only `path:1` evidence is excluded from substantive audit evidence counts.
- `Scope: .` is rejected as missing scope coverage rather than treated as a valid whole-repo scope.

## Decisions

- Keep the new validator failures as explicit issue codes: `missing_risk_hypotheses` and `irrelevant_audit_evidence`.
- Use cached git snapshot reads for path kind, file content, and representative file discovery to avoid validator timeout regressions.

## Patterns

- Fail closed before comparing actual evidence against empty expected scope or risk sets.
- Treat runtime/generated audit artifacts as non-product evidence by default, with direct scope as the opt-in.
