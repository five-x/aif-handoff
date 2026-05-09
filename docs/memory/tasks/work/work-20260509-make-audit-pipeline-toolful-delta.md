<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

---

memory_id: task::aif-handoff::work::work-20260509-make-audit-pipeline-toolful::delta
project_id: project::aif-handoff
repo_name: aif-handoff
lane: work
task_id: work-20260509-make-audit-pipeline-toolful
source_path: docs/rdpi/work/work-20260509-make-audit-pipeline-toolful
stability: validated
sensitivity: local-only
kind: artifact
project: aif-handoff
entity: aif-handoff
scope: task
updated_at: 2026-05-09
supersedes:
expires_at:
tags:

- aif-handoff
- aif-handoff
- aif-handoff
- work
- task-delta
  source_refs:
- docs/rdpi/work/work-20260509-make-audit-pipeline-toolful/research.md
- docs/rdpi/work/work-20260509-make-audit-pipeline-toolful/design.md
- docs/rdpi/work/work-20260509-make-audit-pipeline-toolful/plan.md
- docs/rdpi/work/work-20260509-make-audit-pipeline-toolful/result.md
  created_at: 2026-05-09
  last_verified_at: 2026-05-09

---

# Summary

Curated delta for task work-20260509-make-audit-pipeline-toolful.

# Why it matters

Keeps the reusable task outcome in one reviewable place before publication.

# When to reuse

Reuse this document when checking what was learned from this task.

# When not to reuse

Do not treat task-local implementation details as cross-project guidance unless they were promoted into decisions or patterns.

## Facts

- After task `work-20260509-make-audit-pipeline-toolful`, audit/review/discovery completion requires committed report artifacts and latest main implementation-agent `Tool:` activity.
- Runtime capabilities now include `supportsRepositoryTools`, defaulting to false.
- `qwen-local-agent` API advertises `supportsRepositoryTools: true` because AIF owns the repository tool loop and emits runtime-neutral tool events.
- Text-only API transports such as Codex API, Codex app-server, Claude API, and OpenRouter API remain `supportsRepositoryTools: false` for implementation and review workflows.
- Implementer and review/security workflows require `supportsRepositoryTools`; `supportsAgentDefinitions` remains soft so local Qwen can use AIF-owned tools through direct prompts.
- The implementer no longer writes deterministic diagnostic audit reports locally; diagnostic report creation must run through the configured runtime.
- Completion evidence counts tool activity only in the latest main implementation block (`implement-coordinator` or `aif-implement`) and ignores planner, review, checklist, and stale retry tool activity.
- Runtime capability mismatches are sanitized and moved to `blocked_external` without a retry schedule instead of being treated as transient runtime failures.
- On server 67, project `botIntevra` now defaults task, plan, and review execution to runtime profile `93a454a2-4618-4e43-99d6-125962e25de2` (`qwen-local-agent`, `Qwen Local Agent Canary`) and auto-queue mode is enabled.
- Positive live canary `6c10a354-13e6-4495-a350-044d764a1329` completed with qwen-local-agent tool activity, committed report `audit/2026-05-09-aif-runtime-canary-audit.md`, and commit `ae69c28`.
- Negative live canary `1250d717-9a60-4414-8c38-2f178f6a7e58` using legacy text-only profile `f1f21bb3-523b-4aae-a2d2-83ba7c96e88c` ended in `blocked_external` with reason `Runtime capability check failed. Check the configured runtime profile for this stage.` and `retryCount=0`.

## Decisions

- none

## Patterns

- none
