# Research

## Task framing and lane

- Task: `work-20260515-system-tz-configuration-governance`.
- Lane: `work`.
- Intake card: `docs/intake/work/work-20260515-system-tz-configuration-governance.md`.
- Request: add effective configuration governance so operators can see resolved project configuration, detect drift, validate runtime/project settings, audit task-level overrides, and avoid raw secret exposure.
- RDPI status: planning-only until an independent `PLAN PASS`.

## Accepted planning sources

- `AGENTS.md` and the local `$runtask` / `$rdpi` instructions require full RDPI with independent plan, test, and review gates.
- `docs/kb/system-tz-contract-inventory-freeze.md` freezes current System TZ compatibility surfaces and identifies configuration governance as a separate owner task.
- `docs/configuration.md` documents the existing config surfaces: root `.env`, `.env.local`, runtime profiles, app runtime defaults, project runtime defaults, `.ai-factory/config.yaml`, MCP config, memory flags, permission policy, and usage limits.
- `packages/shared/src/loadEnv.ts` loads root `.env` then `.env.local`, while explicit `process.env` wins. This is process-global and not currently projected as a per-project resolved config view.
- `packages/shared/src/env.ts` validates process env and exposes flags such as `AGENT_USE_SUBAGENTS`, `AGENT_BYPASS_PERMISSIONS`, `AIF_USAGE_LIMITS_ENABLED`, `AIF_MEMORY_ENABLED`, `AIF_WARMUP_ENABLED`, and `AIF_TASK_WORKTREES_ENABLED`.
- `packages/shared/src/projectConfig.ts` resolves `.ai-factory/config.yaml` into paths/workflow/git/language defaults, but invalid scalar values are often normalized to defaults rather than exposed as fail-closed operator issues.
- `packages/shared/src/schema.ts` currently stores app settings, project runtime defaults, task runtime overrides, runtime profiles, memory lifecycle events, usage events, and runtime warmup sessions. It has no generic config audit table.
- `packages/data/src/index.ts` owns runtime profile CRUD, app settings, project runtime defaults, task runtime overrides, effective runtime resolution, runtime limit state, and task activity log redaction.
- `packages/api/src/routes/settings.ts` exposes app runtime defaults, MCP install/status, and raw project config read/write.
- `packages/api/src/routes/projects.ts` exposes project defaults and `.mcp.json` servers, validates some project runtime profile references, and already blocks incompatible parallel auto-queue branch settings.
- `packages/api/src/routes/runtimeProfiles.ts` exposes runtime profile CRUD, effective task/chat runtime, runtime validation, and redacted resolved runtime profile details.
- `packages/api/src/routes/tasks.ts` validates task runtime profile selections on create/update and broadcasts generic task/timeline events.
- `packages/web/src/components/settings/ConfigEditor.tsx`, `packages/web/src/components/project/ProjectRuntimeSettings.tsx`, and `packages/web/src/components/task/TaskSettings.tsx` expose separate config controls, not a canonical governance view.
- Read-only explorer findings confirm gaps: no canonical resolved config object, no durable config-change audit trail, task overrides lack before/after audit records, and runtime profile `optionsJson` / task `runtimeOptionsJson` are generic JSON that need secret-like-key handling.

## Same-project memory

- Not queried before `PLAN PASS` because local RDPI instructions prohibit shared-memory recall before the plan gate unless explicitly waived.
- Existing local `docs/memory/tasks/work/*system-tz*` files may be useful after the plan gate for memory sync, but local repo facts remain the source of truth.

## Cross-project reusable patterns

- Not queried before `PLAN PASS`.
- Reusable local pattern from current repo: memory lifecycle events use an append-only event table; configuration governance can use the same append-only style rather than rewriting historical state.
- Reusable local pattern from current repo: runtime limit/provider metadata is sanitized before browser exposure; configuration views should expose booleans, env var names, keys, and source labels, not raw values.

## Rejected or stale memory candidates

- Treat API docs as planning context only; the explorer noted docs can lag code. Static code wins where docs disagree.
- Treat `.env` and `.env.local` as input sources for the resolved view, not as portable cross-environment source-of-truth files.
- Do not interpret existing `WorkflowTimeline` compatibility DTOs as a full config-audit persistence model.

## Open questions

- Whether later tasks should promote config audit events into the generic workflow timeline event model. This task can expose a bounded project/task config audit surface without changing workflow timeline persistence.
- Whether runtime profile validation should perform live provider connectivity checks before every task start. This task should not make every task start do network validation; fail-closed checks should cover deterministic invalid configuration and unresolved references.
- Whether filesystem knowledge export questions affect config view content. Intake explicitly keeps those open until source-backed memory design decides them.

## Hypotheses

- A canonical resolved config API can satisfy operator visibility and drift detection by projecting existing DB rows, env metadata, project config, MCP config, permission policy, memory flags, usage flags, and runtime defaults into one redacted response.
- Invalid project config can block work deterministically through local validation of `.ai-factory/config.yaml` shape and unsafe values before task events start runtime work.
- Invalid runtime profile config can block work deterministically through unresolved/missing/disabled/foreign profile references, secret-like persisted options/headers, and missing effective runtime profiles before task events start runtime work.
- Config changes can be audited with an append-only data table that records actor/source/action/scope/reason codes and redacted before/after summaries.
- Task-level override changes can use the same audit table plus task activity entries, keeping the audit visible to operators without persisting secrets.
- UI can expose a compact governance panel inside project runtime settings first; existing config editors can remain as editing controls.
