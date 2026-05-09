<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

---

memory_id: task::aif-handoff::work::work-20260509-qwen-local-agent-runtime-canary::delta
project_id: project::aif-handoff
repo_name: aif-handoff
lane: work
task_id: work-20260509-qwen-local-agent-runtime-canary
source_path: docs/rdpi/work/work-20260509-qwen-local-agent-runtime-canary
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
- work
- task-delta
  source_refs:
- docs/rdpi/work/work-20260509-qwen-local-agent-runtime-canary/result.md
  created_at: 2026-05-09
  last_verified_at: 2026-05-09

---

# Summary

Curated delta for task `work-20260509-qwen-local-agent-runtime-canary`.

## Facts

- The canary proved Codex app-server can reach the local Qwen endpoint but cannot use it as an agent runtime because llama.cpp rejects Codex Responses tool schema with `'type' of tool must be 'function'`.

## Decisions

- Use a dedicated `qwen-local-agent` AIF runtime/tool loop for function-style llama.cpp tools rather than extending this Codex app-server canary path.

## Patterns

- none
