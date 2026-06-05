<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

---

memory_id: task::aif-handoff::work::11_observability_and_metrics::entity-capsule
project_id: project::aif-handoff
repo_name: aif-handoff
lane: work
task_id: 11_observability_and_metrics
source_path: docs/rdpi/work/11_observability_and_metrics
stability: stable
sensitivity: local-only
kind: capsule
project: aif-handoff
entity: aif-handoff
scope: project
updated_at: 2026-06-05
supersedes:
expires_at:
tags:

- aif-handoff
- aif-handoff
- aif-handoff
- work
- capsule
  source_refs:
- docs/rdpi/work/11_observability_and_metrics/research.md
- docs/rdpi/work/11_observability_and_metrics/design.md
- docs/rdpi/work/11_observability_and_metrics/plan.md
- docs/rdpi/work/11_observability_and_metrics/result.md
  created_at: 2026-06-05
  last_verified_at: 2026-06-05

---

# Summary

Current capsule for entity aif-handoff, refreshed by task 11_observability_and_metrics.

# Why it matters

Makes entity-level recall cheaper and more consistent.

# When to reuse

Reuse before editing the same component or domain.

# When not to reuse

Do not reuse if the entity boundary or ownership changed.

## Active decisions

- Guardrail observability should reuse structured log metrics, task activity, and task-stage attempts instead of new persistent counter storage.
- Guardrail event dimensions should be standardized and redaction-safe across runtime, agent, and API paths.
- Evidence-related guard events should be visible through existing workflow timeline attempts.
- the exact counter names from the task as stable constants;
- allowed action values: `blocked`, `rework`, `manual`, `fail_closed`, `accepted`, `rejected`;
- a normalized event shape with required keys: `taskId`, `projectId`, `stage`, `workflowKind`, `runtimeProfileId`, `runtimeId`, `providerId`, `toolName`, `artifactPath`, `fingerprint`, `failureFingerprint`, `action`, and `reasonCode`;
- `buildAgentGuardrailMetric(counter, event)` returning a sorted, redaction-safe structured log envelope with `metricKey: counter`, `metricValue: 1`, and dimensions;
- `formatAgentGuardrailActivityLine(counter, event)` returning a compact readable line for `agentActivityLog`;
