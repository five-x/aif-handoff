<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

---

memory_id: task::aif-handoff::work::03_invalid_manifest_fallback_fail_closed::pattern-e9bd1a969fe9cd66
project_id: project::aif-handoff
repo_name: aif-handoff
lane: work
task_id: 03_invalid_manifest_fallback_fail_closed
source_path: docs/rdpi/work/03_invalid_manifest_fallback_fail_closed
stability: validated
sensitivity: shareable
kind: pattern
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
- pattern
  source_refs:
- docs/rdpi/work/03_invalid_manifest_fallback_fail_closed/research.md
- docs/rdpi/work/03_invalid_manifest_fallback_fail_closed/design.md
- docs/rdpi/work/03_invalid_manifest_fallback_fail_closed/plan.md
- docs/rdpi/work/03_invalid_manifest_fallback_fail_closed/result.md
  created_at: 2026-06-03
  last_verified_at: 2026-06-03

---

# Summary

Final evidence persistence must validate at the last write boundary, not only at parse/normalization time.

# Why it matters

Captures a reusable implementation or runbook pattern.

# When to reuse

Reuse when the same operational or implementation pattern appears again.

# When not to reuse

Do not reuse when the pattern depends on obsolete tools or constraints.
