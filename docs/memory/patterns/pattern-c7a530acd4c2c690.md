<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

---

memory_id: task::aif-handoff::work::work-20260523-harden-audit-command-query-output-depth::pattern-c7a530acd4c2c690
project_id: project::aif-handoff
repo_name: aif-handoff
lane: work
task_id: work-20260523-harden-audit-command-query-output-depth
source_path: docs/rdpi/work/work-20260523-harden-audit-command-query-output-depth
stability: validated
sensitivity: shareable
kind: pattern
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
- pattern
  source_refs:
- docs/rdpi/work/work-20260523-harden-audit-command-query-output-depth/research.md
- docs/rdpi/work/work-20260523-harden-audit-command-query-output-depth/design.md
- docs/rdpi/work/work-20260523-harden-audit-command-query-output-depth/plan.md
- docs/rdpi/work/work-20260523-harden-audit-command-query-output-depth/result.md
  created_at: 2026-05-23
  last_verified_at: 2026-05-23

---

# Summary

For command-output evidence, parse observed result bodies separately from command selectors and prose labels before applying risk-specific evidence-depth matching.

# Why it matters

Captures a reusable implementation or runbook pattern.

# When to reuse

Reuse when the same operational or implementation pattern appears again.

# When not to reuse

Do not reuse when the pattern depends on obsolete tools or constraints.
