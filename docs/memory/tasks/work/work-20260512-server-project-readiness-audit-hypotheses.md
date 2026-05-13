<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

---

memory_id: task::aif-handoff::work::work-20260512-server-project-readiness-audit::hypotheses
project_id: project::aif-handoff
repo_name: aif-handoff
lane: work
task_id: work-20260512-server-project-readiness-audit
source_path: docs/rdpi/work/work-20260512-server-project-readiness-audit
stability: draft
sensitivity: forbidden
kind: hypothesis
project: aif-handoff
entity: aif-handoff
scope: task
updated_at: 2026-05-11
supersedes:
expires_at:
tags:

- aif-handoff
- aif-handoff
- aif-handoff
- work
- hypothesis
  source_refs:
- docs/rdpi/work/work-20260512-server-project-readiness-audit/research.md
- docs/rdpi/work/work-20260512-server-project-readiness-audit/design.md
- docs/rdpi/work/work-20260512-server-project-readiness-audit/plan.md
- docs/rdpi/work/work-20260512-server-project-readiness-audit/result.md
  created_at: 2026-05-11
  last_verified_at: 2026-05-11

---

# Summary

Local-only hypotheses collected during task work-20260512-server-project-readiness-audit.

# Why it matters

Preserves open questions for follow-up without promoting them into shared memory.

# When to reuse

Reuse only while the task is still active or under review.

# When not to reuse

Do not publish or treat these hypotheses as validated facts.

## Hypotheses

- The server likely already has enough application services if `api`, `web`, `agent`, and `mcp` are healthy; missing behavior is more likely to be configuration, path mapping, credentials, runtime profiles, or memory workflow than missing Node packages on the host.
- Production project storage may be misaligned: local docs name `/srv/aif-handoff/projects`, while `docker-compose.production.yml` currently uses a named Docker volume for `projects`.
- For unattended work, runtime profiles plus provider credentials are the critical server setup, not MCP alone.
- For "self-learning" behavior, the missing operational piece may be a documented memory close-out process for projects rather than automatic fine-tuning.
