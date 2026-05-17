# System TZ Operator API WS Trust Surfaces

- Task ID: work-20260515-system-tz-operator-api-ws-trust-surfaces
- Lane: work
- Status: queued
- Priority: high
- Created: 2026-05-15
- Due: after trust backbone API contract is planned
- Source: `C:\Users\apron\Desktop\aif_handoff_system_tz.md`, sections 14, 15, 23 Phase 6, 25 P0/P1
- RDPI Needed: yes
- RDPI Path: docs/rdpi/work/work-20260515-system-tz-operator-api-ws-trust-surfaces

## Request

Expose the System TZ trust backbone through REST APIs, WebSocket events, and operator UI surfaces.

Operators should be able to understand why a task is blocked, rework, manual, trusted, weak, or untrusted without reading raw logs.

## Done When

- REST endpoints or equivalent API surfaces expose task timeline, artifact trust, evidence, project knowledge, project runtime usage, manual exception action, and worktree cleanup action.
- WebSocket events cover timeline updates, evidence recorded, trust updated, manual handoff required, memory candidate created, usage updated, queue updated, and worktree warning.
- Internal broadcast security uses production tokening, loopback-only dev fallback, relation validation, bounded payloads, and no raw secrets.
- Task cards show badges for intent, runtime profile, cost, manual review, blocked reason family, artifact trust, worktree, scheduled, auto-queue, and memory candidate where applicable.
- Task detail exposes Overview, Plan, Implementation, Review, Timeline, Evidence, Artifacts, Memory, Runtime, Git, and Comments views or an equivalent navigable structure.
- Evidence, trust, runtime, and queue views show the fields listed in the System TZ.

## Constraints

- Do not change trust semantics for display convenience.
- Do not expose raw provider diagnostics, secrets, or unbounded command output.
- Avoid card-heavy marketing layout; this is an operator UI for repeated diagnostic work.

## Notes

- This task should reuse existing timeline and audit trust UI components where possible.
