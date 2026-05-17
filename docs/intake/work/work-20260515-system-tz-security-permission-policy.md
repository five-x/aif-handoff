# System TZ Security Permission Policy

- Task ID: work-20260515-system-tz-security-permission-policy
- Lane: work
- Status: queued
- Priority: high
- Created: 2026-05-15
- Due: after TaskIntentContract v2 and runtime governance planning
- Source: `C:\Users\apron\Desktop\aif_handoff_system_tz.md`, sections 19, 23 Phase 8, 25 P2
- RDPI Needed: yes
- RDPI Path: docs/rdpi/work/work-20260515-system-tz-security-permission-policy

## Request

Define and enforce per-intent execution permissions, shell command policy, network policy, dangerous command detection, human approval bridge, and secret redaction across runtime, evidence, logs, WebSocket, and chat.

## Done When

- Permission modes are represented for danger_full_access, workspace_write, read_only, review_only, and audit_diagnostic_only.
- Intent policy maps feature/fix/tests/docs/spike/audit to default permission modes and allowed exceptions.
- Audit tasks cannot modify source/config/test files.
- Docs tasks cannot modify source files.
- Dangerous shell commands can be blocked by policy.
- Secret-like evidence is redacted before memory, evidence, runtime logs, activity logs, WebSocket payloads, or chat transcript persistence.
- Bypass mode is visible and audited.

## Constraints

- Do not store raw secrets in shared memory, server memory, logs, evidence, or UI payloads.
- Do not weaken current runtime safety defaults.
- Advanced production sandboxing can be deferred, but the policy boundary must be explicit.

## Notes

- This task should coordinate with runtime governance because approval and sandbox behavior is runtime-adapter dependent.
