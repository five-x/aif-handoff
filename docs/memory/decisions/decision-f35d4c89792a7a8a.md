<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

---

memory_id: task::aif-handoff::work::03_invalid_manifest_fallback_fail_closed::decision-f35d4c89792a7a8a
project_id: project::aif-handoff
repo_name: aif-handoff
lane: work
task_id: 03_invalid_manifest_fallback_fail_closed
source_path: docs/rdpi/work/03_invalid_manifest_fallback_fail_closed
stability: validated
sensitivity: shareable
kind: decision
project: aif-handoff
entity: aif-handoff
scope: project
updated_at: 2026-06-03
supersedes:
expires_at:
tags:

- aif-handoff
- aif-handoff
- aif-handoff
- work
- decision
  source_refs:
- docs/rdpi/work/03_invalid_manifest_fallback_fail_closed/research.md
- docs/rdpi/work/03_invalid_manifest_fallback_fail_closed/design.md
- docs/rdpi/work/03_invalid_manifest_fallback_fail_closed/plan.md
- docs/rdpi/work/03_invalid_manifest_fallback_fail_closed/result.md
  created_at: 2026-06-03
  last_verified_at: 2026-06-03

---

# Summary

After the cap, use `blockedReason="implementation_manifest_invalid_after_rework_limit: <issueCodes>"`, `manualReviewRequired=true`, `reworkRequested=false`.

# Why it matters

Captures a reusable decision made during the task.

# When to reuse

Reuse when the same design pressure appears again.

# When not to reuse

Do not reuse when the constraints that justified the decision changed.
