<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

---

memory_id: task::aif-handoff::work::work-20260530-stage-aware-runtime-routing-and-qwen-caps::hypotheses
project_id: project::aif-handoff
repo_name: aif-handoff
lane: work
task_id: work-20260530-stage-aware-runtime-routing-and-qwen-caps
source_path: docs/rdpi/work/work-20260530-stage-aware-runtime-routing-and-qwen-caps
stability: draft
sensitivity: forbidden
kind: hypothesis
project: aif-handoff
entity: aif-handoff
scope: task
updated_at: 2026-05-30
supersedes:
expires_at:
tags:

- aif-handoff
- aif-handoff
- aif-handoff
- work
- hypothesis
  source_refs:
- docs/rdpi/work/work-20260530-stage-aware-runtime-routing-and-qwen-caps/research.md
- docs/rdpi/work/work-20260530-stage-aware-runtime-routing-and-qwen-caps/design.md
- docs/rdpi/work/work-20260530-stage-aware-runtime-routing-and-qwen-caps/plan.md
- docs/rdpi/work/work-20260530-stage-aware-runtime-routing-and-qwen-caps/result.md
  created_at: 2026-05-30
  last_verified_at: 2026-05-30

---

# Summary

Local-only hypotheses collected during task work-20260530-stage-aware-runtime-routing-and-qwen-caps.

# Why it matters

Preserves open questions for follow-up without promoting them into shared memory.

# When to reuse

Reuse only while the task is still active or under review.

# When not to reuse

Do not publish or treat these hypotheses as validated facts.

## Hypotheses

- H1: A shared stage-policy helper can make data routing, agent execution, and tests use one deterministic capability matrix without a schema migration.
- H2: Runtime profile `options` can carry explicit stage capability/canary flags and per-stage caps without changing the database schema.
- H3: Filtering disallowed profiles in `resolveEffectiveRuntimeProfile` will let valid fallback profiles run while making Qwen implementer defaults disappear from implementation routing.
- H4: Subagent-level enforcement is still required because coordinator fallbacks and test/direct call paths can bypass data candidate filtering.
- H5: Qwen endpoint context caps should be enforced inside the adapter request-budget calculation so a stage cap cannot be ignored by direct adapter calls.
