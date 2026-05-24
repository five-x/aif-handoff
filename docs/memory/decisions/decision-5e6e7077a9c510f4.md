<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

---

memory_id: task::aif-handoff::work::work-20260523-harden-audit-command-query-output-depth::decision-5e6e7077a9c510f4
project_id: project::aif-handoff
repo_name: aif-handoff
lane: work
task_id: work-20260523-harden-audit-command-query-output-depth
source_path: docs/rdpi/work/work-20260523-harden-audit-command-query-output-depth
stability: validated
sensitivity: shareable
kind: decision
project: aif-handoff
entity: aif-handoff
scope: project
updated_at: 2026-05-23
supersedes:
expires_at:
tags:

- aif-handoff
- aif-handoff
- aif-handoff
- work
- decision
  source_refs:
- docs/rdpi/work/work-20260523-harden-audit-command-query-output-depth/research.md
- docs/rdpi/work/work-20260523-harden-audit-command-query-output-depth/design.md
- docs/rdpi/work/work-20260523-harden-audit-command-query-output-depth/plan.md
- docs/rdpi/work/work-20260523-harden-audit-command-query-output-depth/result.md
  created_at: 2026-05-23
  last_verified_at: 2026-05-23

---

# Summary

For ledger-backed no-findings evidence, a search-like `AuditEvidenceUnit` can count as risk-substantive only when `outputPreview` contains the risk concept after path-like tokens are stripped. The ledger command itself remains valid provenance, but it is not enough to prove the result body was risk-substantive.

# Why it matters

Captures a reusable decision made during the task.

# When to reuse

Reuse when the same design pressure appears again.

# When not to reuse

Do not reuse when the constraints that justified the decision changed.
