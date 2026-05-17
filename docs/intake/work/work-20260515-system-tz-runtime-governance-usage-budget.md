# System TZ Runtime Governance Usage Budget

- Task ID: work-20260515-system-tz-runtime-governance-usage-budget
- Lane: work
- Status: queued
- Priority: high
- Created: 2026-05-15
- Due: after contract inventory and runtime source mapping
- Source: `C:\Users\apron\Desktop\aif_handoff_system_tz.md`, sections 11, 20, 23 Phase 7, 25 P1/P2
- RDPI Needed: yes
- RDPI Path: docs/rdpi/work/work-20260515-system-tz-runtime-governance-usage-budget

## Request

Implement runtime governance for per-stage runtime selection, limit snapshots, warmup state, fallback policy, usage events, and budget enforcement.

Runtime behavior must be visible, auditable, and never silently change task semantics.

## Done When

- Runtime profiles resolve through task override, project default, app default, and environment fallback with per-stage defaults for planner, plan checker, implementer, reviewer, security, chat, audit, and synthesis.
- Runtime limit snapshots capture provider, runtime, profile, source, status, precision, windows, reset time, retryAfter, and checkedAt.
- Runtime limits support proactive task blocking, auto-resume, UI warnings, runtime fallback, and cost planning.
- Warmup seed sessions are stage/runtime aware, TTL-bound, safe for secrets/prompt logging, visible in UI, and compatible with unsupported-runtime fallback.
- Fallback policy follows the TZ: planner fallback allowed, implementer blocked, reviewer fallback warning, audit blocked for evidence consistency.
- Every runtime call writes a usage event and UI shows per-task/project/chat cost and budget state.
- Budget breaches warn or block according to configured thresholds, with manual override justification.

## Constraints

- Runtime fallback must be explicit in task state, logs, and UI.
- Do not expose raw provider diagnostics or secrets.
- Do not silently switch audit runtime when evidence consistency matters.

## Notes

- This card combines runtime governance and usage/cost accounting because both depend on the same runtime call source of truth.
