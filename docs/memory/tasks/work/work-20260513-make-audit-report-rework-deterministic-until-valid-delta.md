<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

---

memory_id: task::aif-handoff::work::work-20260513-make-audit-report-rework-deterministic-until-valid::delta
project_id: project::aif-handoff
repo_name: aif-handoff
lane: work
task_id: work-20260513-make-audit-report-rework-deterministic-until-valid
source_path: docs/rdpi/work/work-20260513-make-audit-report-rework-deterministic-until-valid
stability: validated
sensitivity: local-only
kind: artifact
project: aif-handoff
entity: aif-handoff
scope: task
updated_at: 2026-05-14
supersedes:
expires_at:
tags:

- aif-handoff
- aif-handoff
- aif-handoff
- work
- task-delta
  source_refs:
- docs/rdpi/work/work-20260513-make-audit-report-rework-deterministic-until-valid/research.md
- docs/rdpi/work/work-20260513-make-audit-report-rework-deterministic-until-valid/design.md
- docs/rdpi/work/work-20260513-make-audit-report-rework-deterministic-until-valid/plan.md
- docs/rdpi/work/work-20260513-make-audit-report-rework-deterministic-until-valid/result.md
  created_at: 2026-05-14
  last_verified_at: 2026-05-14

---

# Summary

Curated delta for task work-20260513-make-audit-report-rework-deterministic-until-valid.

# Why it matters

Keeps the reusable task outcome in one reviewable place before publication.

# When to reuse

Reuse this document when checking what was learned from this task.

# When not to reuse

Do not treat task-local implementation details as cross-project guidance unless they were promoted into decisions or patterns.

## Facts

- none

## Decisions

- Deterministic report repair must be self-validating before review handoff.
- Repeated strict validator failures should terminalize with exact validator issue codes instead of falling through to general LLM implementation.
- `source_inconclusive` remains a terminal non-trusted audit source, not a trusted valid report.

## Patterns

- For strict artifact repair, run deterministic validator authority in the same stage that writes the artifact, before handing the task to an LLM or review loop.
