# Research: System TZ Runtime Governance Usage Budget

## Task Framing And Lane

- Task ID: `work-20260515-system-tz-runtime-governance-usage-budget`.
- Lane: `work`.
- Intake source: `docs/intake/work/work-20260515-system-tz-runtime-governance-usage-budget.md`.
- Scope: implement runtime governance for stage-aware runtime selection, limit snapshots, warmup state, fallback policy, usage events, and budget enforcement.
- This is implementation work, not an audit-only task. Runtime-visible probing was not performed before plan review; research used local files and docs only.

## Accepted Planning Sources Or Local Facts

- `AGENTS.md` and the task card require RDPI gates, immutable intake intent, independent plan/test/review gates, and memory sync before marking the task done.
- System TZ section 11 requires runtime profile selection through task override, project default, app default, and environment fallback, plus per-stage defaults for planner, plan checker, implementer, reviewer, security, chat, audit, and synthesis.
- System TZ section 11 also requires normalized limit snapshots with provider/runtime/profile/source/status/precision/windows/reset/retry/checked fields, and use for proactive blocking, auto-resume, UI warnings, fallback, and cost planning.
- System TZ section 20 defines `usage_events` as the source of truth for usage/cost accounting and requires budget warning, hard blocking, fallback only where policy allows, and manual override justification.
- `docs/kb/system-tz-contract-inventory-freeze.md` records that current runtime usage events persist and aggregate, but runtime limits and budgets are not yet deterministic trust inputs.
- `docs/providers.md` documents current effective profile resolution as task override, project default, app default, then environment fallback. It currently has `task`, `plan`, `review`, and `chat` modes rather than the full System TZ stage list.
- `packages/shared/src/schema.ts` currently stores project/app defaults for task, plan, review, and chat only; task runtime override is `tasks.runtime_profile_id`.
- `packages/data/src/index.ts` owns `resolveEffectiveRuntimeProfile`, `getAppDefaultRuntimeProfileId`, runtime limit snapshot persistence, task runtime gate blocking, usage event writes, and warmup session persistence.
- `packages/agent/src/coordinator.ts` maps planner and plan-checker to `plan`, reviewer to `review`, and implementer to `task` for proactive runtime-limit gates. The mapping is implicit and not a durable policy contract.
- `packages/runtime/src/registry.ts` records usage only after successful adapter results with non-null usage. Failed calls, null-usage paths, and `usageReporting=NONE` runs do not currently produce a `usage_events` row.
- `packages/shared/src/constants.ts` defines warmup targets for planner, implementer, and reviewer. Security can reuse reviewer warmup, but audit and synthesis are absent.
- `packages/agent/src/subagentQuery.ts` already writes sanitized runtime activity, observes runtime-limit events, persists profile/task limit snapshots, and selects warmup sessions by runtime/profile/model.
- `packages/web` already has runtime usage and runtime-limit UI surfaces through `RuntimeUsageDialog`, `TaskCard`, `TaskDetailHeader`, and project/global runtime settings. UI currently reflects the compressed mode model.
- Runtime-limit auto-resume already has a generic path: `packages/agent/src/taskWatchdog.ts` releases due `blocked_external` tasks whose `retryAfter` has elapsed and restores `blockedFromStatus`; `packages/agent/src/coordinator.ts` runs that release at the start of each poll cycle; `packages/agent/src/__tests__/coordinator.test.ts` covers waiting before `retryAfter` and release after `retryAfter`.
- Current cost visibility is split: task cost appears on task detail/header surfaces, project cost appears in project metrics/overview, chat-session aggregates exist in schema/data and are used for usage rollups, and runtime-profile usage appears in the runtime usage dialog. Budget state is only partially visible today because the only persisted budget fields are project stage budgets.

## Same-Project Memory

- `docs/memory/tasks/work/work-20260515-system-tz-contract-inventory-freeze-delta.md` and its RDPI result establish the freeze document as the accepted Phase 0 planning source for System TZ tasks.
- `docs/memory/tasks/work/work-20260515-system-tz-workflow-timeline-trust-backbone-delta.md` records a compatibility-first migration pattern: add generic read models while preserving current audit/roadmap sources.
- `docs/memory/tasks/work/work-20260508-harden-planner-replan-loop-delta.md` records that runtime fallback behavior should be capability-gated and explicit, not assumed from runtime shape.
- `docs/memory/tasks/work/work-20260512-server-side-memory-loop-delta.md` records an append-only usage-audit pattern for prompt context, supporting the same source-of-truth approach for runtime calls.

## Cross-Project Reusable Patterns

- No cross-project memory was needed. Local docs and same-project curated memory were sufficient.

## Rejected Or Stale Memory Candidates

- Historical notes about deterministic audit fallback are relevant only as guardrails against silent audit/runtime switching. They do not authorize changing audit validators or audit artifact terminalization in this task.
- API/MCP/WebSocket docs are treated as candidate contract descriptions, not as higher authority than current source code, because the freeze document warns that some docs may lag code.

## Open Questions

- Whether product wants physically separate project/app default columns for all eight System TZ stages, or a compatibility stage mapping that keeps existing task/plan/review/chat slots as the durable storage for now.
- Whether a failed runtime attempt with no token usage should increment usage aggregates. For this task, the safest interpretation is to append a zero-usage `usage_events` row with an outcome while leaving aggregate totals unchanged.
- Whether manual budget override needs first-class UI in this slice. The current implementation can use task `runtimeOptions` as a reviewable override carrier without adding a new public workflow.

## Hypotheses

- H1: A canonical stage-policy layer can satisfy the governance requirement without a broad schema migration by mapping System TZ stages to existing compatibility slots and making the mapping explicit in shared/data/agent code.
- H2: Usage-event append coverage can be improved safely by recording zero-usage outcome rows for failed and missing-usage calls while preserving current aggregate counters.
- H3: Budget enforcement can start as a deterministic pre-start stage gate over project budget fields and task-scoped stage usage, with warning/block decisions visible in activity logs and blocked reasons.
- H4: Warmup can become stage-aware by adding audit/synthesis targets and by documenting/reusing reviewer/security compatibility where the current runtime profile slot is shared.
- H5: Auto-resume can be satisfied by preserving the existing `retryAfter` release path and adding runtime-limit-specific acceptance/tests so provider `resetAt` / `retryAfterSeconds` snapshots are demonstrably what schedules the release.

## Proposed Verification Evidence

- Focused shared/data/runtime/agent tests for stage mapping, runtime profile resolution, usage event outcomes, budget gate decisions, coordinator blocking, and warmup target expansion.
- Focused web tests only if UI changes are needed after implementation.
- `npm.cmd run build --workspace=@aif/shared`, `@aif/data`, `@aif/runtime`, `@aif/agent`, and any touched API/web package.
- `git diff --check` over touched files.
