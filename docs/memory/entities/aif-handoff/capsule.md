<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

---

memory_id: task::aif-handoff::work::work-20260515-system-tz-configuration-governance::entity-capsule
project_id: project::aif-handoff
repo_name: aif-handoff
lane: work
task_id: work-20260515-system-tz-configuration-governance
source_path: docs/rdpi/work/work-20260515-system-tz-configuration-governance
stability: stable
sensitivity: local-only
kind: capsule
project: aif-handoff
entity: aif-handoff
scope: project
updated_at: 2026-05-17
supersedes:
expires_at:
tags:

- aif-handoff
- aif-handoff
- aif-handoff
- work
- capsule
  source_refs:
- docs/rdpi/work/work-20260515-system-tz-configuration-governance/research.md
- docs/rdpi/work/work-20260515-system-tz-configuration-governance/design.md
- docs/rdpi/work/work-20260515-system-tz-configuration-governance/plan.md
- docs/rdpi/work/work-20260515-system-tz-configuration-governance/result.md
  created_at: 2026-05-17
  last_verified_at: 2026-05-17

---

# Summary

Current capsule for entity aif-handoff, refreshed by task work-20260515-system-tz-configuration-governance.

# Why it matters

Makes entity-level recall cheaper and more consistent.

# When to reuse

Reuse before editing the same component or domain.

# When not to reuse

Do not reuse if the entity boundary or ownership changed.

## Active decisions

- Config governance should be an operator projection and audit layer over existing config sources, not a new source of truth.
- Secret-like dynamic keys in runtime options and MCP/env summaries are blocking config issues unless they are represented as env var names or redacted key-only metadata.
- Task runtime override changes deserve durable append-only audit events, not only generic task updated broadcasts.
- Add shared/data models for a redacted resolved project config view and append-only config audit events.
- Add API endpoints and guards that project the resolved view, list audit events, validate deterministic config issues, and block task work when blocking config issues exist.
- Emit audit events from app defaults, project settings, project config, runtime profile mutations, and task runtime override changes.
- Surface the resolved governance view in the project runtime/settings UI, including runtime defaults, git/workflow settings, memory settings, permission policy, usage limits, MCP config, validation issues, and recent audit events.
