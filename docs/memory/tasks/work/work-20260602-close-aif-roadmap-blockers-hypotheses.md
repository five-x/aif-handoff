<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

---

memory_id: task::aif-handoff::work::work-20260602-close-aif-roadmap-blockers::hypotheses
project_id: project::aif-handoff
repo_name: aif-handoff
lane: work
task_id: work-20260602-close-aif-roadmap-blockers
source_path: docs/rdpi/work/work-20260602-close-aif-roadmap-blockers
stability: draft
sensitivity: forbidden
kind: hypothesis
project: aif-handoff
entity: aif-handoff
scope: task
updated_at: 2026-06-02
supersedes:
expires_at:
tags:

- aif-handoff
- aif-handoff
- aif-handoff
- work
- hypothesis
  source_refs:
- docs/rdpi/work/work-20260602-close-aif-roadmap-blockers/research.md
- docs/rdpi/work/work-20260602-close-aif-roadmap-blockers/design.md
- docs/rdpi/work/work-20260602-close-aif-roadmap-blockers/plan.md
- docs/rdpi/work/work-20260602-close-aif-roadmap-blockers/result.md
  created_at: 2026-06-02
  last_verified_at: 2026-06-02

---

# Summary

Local-only hypotheses collected during task work-20260602-close-aif-roadmap-blockers.

# Why it matters

Preserves open questions for follow-up without promoting them into shared memory.

# When to reuse

Reuse only while the task is still active or under review.

# When not to reuse

Do not publish or treat these hypotheses as validated facts.

## Hypotheses

- Full-mode and accept-existing-plan failures can be reduced by normalizing/repairing plan manifests before quality evaluation while preserving task-size split rejection.
- Pre-implementation write safety can be hardened by forcing read-only Codex sandbox options and denying write-like `run_shell` commands in read-only Qwen workflows.
- QA missing-block fallback can remain fail-closed by requiring strict fresh passed mandatory evidence and broadening only evidence summaries/metadata, not pass conditions.
- Container parent closeout can skip executable QA/acceptance freshness only when the task is a container and direct children satisfy its closeout policy.
- Requirements intake can avoid irrelevant actor questions by recognizing explicit internal/test-only/operator cards as actor-specified.
- Deploy readiness can be clarified in acceptance pack metadata/markdown without creating an external deployment requirement.
