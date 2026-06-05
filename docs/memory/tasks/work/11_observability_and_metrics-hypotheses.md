<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

---

memory_id: task::aif-handoff::work::11_observability_and_metrics::hypotheses
project_id: project::aif-handoff
repo_name: aif-handoff
lane: work
task_id: 11_observability_and_metrics
source_path: docs/rdpi/work/11_observability_and_metrics
stability: draft
sensitivity: forbidden
kind: hypothesis
project: aif-handoff
entity: aif-handoff
scope: task
updated_at: 2026-06-05
supersedes:
expires_at:
tags:

- aif-handoff
- aif-handoff
- aif-handoff
- work
- hypothesis
  source_refs:
- docs/rdpi/work/11_observability_and_metrics/research.md
- docs/rdpi/work/11_observability_and_metrics/design.md
- docs/rdpi/work/11_observability_and_metrics/plan.md
- docs/rdpi/work/11_observability_and_metrics/result.md
  created_at: 2026-06-05
  last_verified_at: 2026-06-05

---

# Summary

Local-only hypotheses collected during task 11_observability_and_metrics.

# Why it matters

Preserves open questions for follow-up without promoting them into shared memory.

# When to reuse

Reuse only while the task is still active or under review.

# When not to reuse

Do not publish or treat these hypotheses as validated facts.

## Hypotheses

- A shared `guardrailObservability` helper in `@aif/shared` can standardize counter names, action values, reason codes, dimensions, and readable activity formatting.
- Emitting structured Pino logs with `metricKey` equal to the requested counter name and `metricValue: 1` will make counters available for diagnostics in the same way requirements metrics are available.
- Recording task-stage artifact attempts with a `guardrail_event` kind for evidence-related guard events will make them visible in existing timeline/artifact readback without schema changes.
- Focused tests can verify the five required guard categories and redaction without running live services.
