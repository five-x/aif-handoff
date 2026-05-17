# System TZ Task Intent Contract V2

- Task ID: work-20260515-system-tz-task-intent-contract-v2
- Lane: work
- Status: queued
- Priority: critical
- Created: 2026-05-15
- Due: after contract inventory freeze
- Source: `C:\Users\apron\Desktop\aif_handoff_system_tz.md`, sections 3, 4, 23 Phase 1, 24
- RDPI Needed: yes
- RDPI Path: docs/rdpi/work/work-20260515-system-tz-task-intent-contract-v2

## Request

Implement TaskIntentContract v2 as a deterministic policy layer for `general`, `feature`, `fix`, `spike`, `docs`, `tests`, and `audit` tasks.

The contract must define allowed changes, forbidden changes, expected artifacts, required gates, verification requirements, memory rules, and review rules per intent, then make planner, implementer, reviewer, completion guard, API/MCP task creation, chat task creation, and UI surfaces consume the same policy source.

## Done When

- A single shared contract model represents all supported task intents and exports deterministic policy data.
- `formatTaskIntentContractForPrompt()` reflects the policy model instead of being free-form prompt text.
- Planner, implementer, reviewer, completion guard, API/MCP/chat task creation, and UI task surfaces use the same intent constraints.
- Tasks cannot complete when final artifacts or changed files contradict their intent contract.
- UI shows the intent and its primary constraints in task creation and task detail surfaces.

## Constraints

- Preserve existing typed task intent compatibility.
- Do not turn audit-specific rules into generic feature/fix rules.
- Do not weaken audit invariants such as diagnostic-only audit behavior.
- Do not bundle PlanManifest validation implementation unless the approved RDPI plan proves the slice is still safe.

## Notes

- Depends conceptually on `work-20260515-system-tz-contract-inventory-freeze`.
- This should consume the existing `work-20260510-typed-task-intents` result rather than replacing it wholesale.
