<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

---

memory_id: task::aif-handoff::work::work-20260513-make-audit-report-rework-deterministic-until-valid::pattern-6ec73e2d4b6fb9c4
project_id: project::aif-handoff
repo_name: aif-handoff
lane: work
task_id: work-20260513-make-audit-report-rework-deterministic-until-valid
source_path: docs/rdpi/work/work-20260513-make-audit-report-rework-deterministic-until-valid
stability: validated
sensitivity: shareable
kind: pattern
project: aif-handoff
entity: aif-handoff
scope: project
updated_at: 2026-05-14
supersedes:
expires_at:
tags:

- aif-handoff
- aif-handoff
- aif-handoff
- work
- pattern
  source_refs:
- docs/rdpi/work/work-20260513-make-audit-report-rework-deterministic-until-valid/research.md
- docs/rdpi/work/work-20260513-make-audit-report-rework-deterministic-until-valid/design.md
- docs/rdpi/work/work-20260513-make-audit-report-rework-deterministic-until-valid/plan.md
- docs/rdpi/work/work-20260513-make-audit-report-rework-deterministic-until-valid/result.md
  created_at: 2026-05-14
  last_verified_at: 2026-05-14

---

# Summary

For strict artifact repair, run deterministic validator authority in the same stage that writes the artifact, before handing the task to an LLM or review loop.

# Why it matters

Captures a reusable implementation or runbook pattern.

# When to reuse

Reuse when the same operational or implementation pattern appears again.

# When not to reuse

Do not reuse when the pattern depends on obsolete tools or constraints.
