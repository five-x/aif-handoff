# Stage-Aware Runtime Routing And Qwen Caps

- Task ID: work-20260530-stage-aware-runtime-routing-and-qwen-caps
- Lane: work
- Status: done
- Priority: critical
- Created: 2026-05-30
- Source: operator request after local Qwen implementer exhausted max tool turns on a production-like child task.
- RDPI Needed: yes
- RDPI Path: docs/rdpi/work/work-20260530-stage-aware-runtime-routing-and-qwen-caps

## Request

Add stage-aware runtime routing and strict local Qwen caps so unsupported or underpowered model profiles cannot run implementation by default.

The system must know which runtime profiles are allowed for planning, reviewing, and implementation. A local Qwen profile may be allowed for implementation only after an explicit capability flag or canary proves it can complete tool-using code tasks within budget.

## Problem

The failed `zai-mi.com` child used a local Qwen implementer profile that exhausted the max tool-turn limit. The orchestration treated the profile as eligible for implementation, but the runtime behavior shows it is not currently safe as the default implementer for broad production-like tasks.

## In Scope

- Runtime capability matrix by stage.
- Explicit allow/deny behavior for `implementer` on local Qwen profiles.
- Per-stage caps for tool turns, wall-clock time, token budget, retry count, and context size.
- Operator-facing messages when no capable implementer runtime is available.
- Canary or configuration contract for enabling local Qwen implementation.

## Out Of Scope

- Installing or tuning GPU cluster models directly in this repository task.
- Selecting a final model vendor without operator approval.
- Relaxing task-size gates to compensate for weak runtime profiles.

## Acceptance Criteria

- Unsupported Qwen/local profiles cannot run implementation by default.
- Enabling Qwen/local implementation requires an explicit configuration flag or passing canary evidence.
- Stage caps are enforced and fail closed with sanitized error categories.
- If no implementation-capable runtime exists, the task blocks before implementation with an operator-readable infrastructure message.
- Tests cover denied Qwen implementation routing, explicitly enabled routing, cap exhaustion, and safe error redaction.

## Done When

- Runtime routing is stage-aware and deterministic.
- Implementation uses only profiles declared capable for tool-using code work.
- `npm run format:check`, `npm run lint`, `npm run test`, and `npm run build` pass or any pre-existing unrelated failures are documented.
