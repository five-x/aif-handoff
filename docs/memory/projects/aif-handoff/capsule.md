<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

---

memory_id: task::aif-handoff::work::work-20260509-make-audit-pipeline-toolful::project-capsule
project_id: project::aif-handoff
repo_name: aif-handoff
lane: work
task_id: work-20260509-make-audit-pipeline-toolful
source_path: docs/rdpi/work/work-20260509-make-audit-pipeline-toolful
stability: stable
sensitivity: local-only
kind: capsule
project: aif-handoff
entity: aif-handoff
scope: project
updated_at: 2026-05-09
supersedes:
expires_at:
tags:

- aif-handoff
- aif-handoff
- work
- capsule
  source_refs:
- docs/rdpi/work/work-20260509-make-audit-pipeline-toolful/research.md
- docs/rdpi/work/work-20260509-make-audit-pipeline-toolful/design.md
- docs/rdpi/work/work-20260509-make-audit-pipeline-toolful/plan.md
- docs/rdpi/work/work-20260509-make-audit-pipeline-toolful/result.md
  created_at: 2026-05-09
  last_verified_at: 2026-05-09

---

# Summary

Current capsule for project aif-handoff, refreshed by task work-20260509-make-audit-pipeline-toolful.

# Why it matters

Provides compact recall for future work on the same project.

# When to reuse

Reuse before starting related work in this repository.

# When not to reuse

Do not reuse blindly if the project architecture changed after this task.

## Current stable facts

- Audit/review/discovery completion now requires committed report artifacts and latest main implementation-agent `Tool:` activity.
- Runtime capability `supportsRepositoryTools` defaults to false and is required by implementer and review/security workflows.
- `qwen-local-agent` API is the tool-capable local Qwen path; Codex API/app-server, Claude API, and OpenRouter API are not treated as repository-tool-capable for this patch.
- The implementer no longer writes deterministic diagnostic audit reports locally; report artifacts must be created through the configured runtime.
- Capability mismatches are sanitized and moved to `blocked_external` without retry scheduling.
- On server 67, botIntevra task/plan/review defaults point to `qwen-local-agent` profile `93a454a2-4618-4e43-99d6-125962e25de2`, and project auto-queue is enabled.
- Live validation: positive canary `6c10a354-13e6-4495-a350-044d764a1329` completed with tool activity and committed report `audit/2026-05-09-aif-runtime-canary-audit.md`; negative canary `1250d717-9a60-4414-8c38-2f178f6a7e58` using legacy text-only profile blocked with `Runtime capability check failed. Check the configured runtime profile for this stage.`
