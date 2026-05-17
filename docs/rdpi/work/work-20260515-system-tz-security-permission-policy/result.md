# Result: System TZ Security Permission Policy

Task ID: `work-20260515-system-tz-security-permission-policy`
Date: 2026-05-17

## Implementation Summary

- Added a shared provider-neutral permission policy core with canonical modes: `danger_full_access`, `workspace_write`, `read_only`, `review_only`, and `audit_diagnostic_only`.
- Mapped task intents `general`, `feature`, `fix`, `tests`, `docs`, `spike`, and `audit` to default permission modes, file boundaries, shell/network rules, and bypass visibility requirements.
- Threaded `execution.permissionPolicy` through API one-shot runtime runs, chat runtime runs, and subagent runtime runs.
- Added Qwen local-agent shell policy enforcement before structured shell execution, with dangerous shell commands failing closed when no human approval bridge is available.
- Added task activity visibility for task-scoped bypass runs via `[permission-policy:bypass] intent=<intent> defaultMode=<mode>`.
- Enforced bypass policy decisions so disallowed intents, including `audit`, clear native provider bypass and record `[permission-policy:bypass-blocked]`.
- Added redaction before activity-log persistence, chat transcript persistence, chat websocket token sends, and shared WebSocket serialization.
- Extended recursive WebSocket redaction to secret-like dynamic object keys as well as values.
- Documented policy modes, intent defaults, dangerous shell behavior, fail-closed approval behavior, and bypass audit visibility in provider/configuration docs.

## Verification

Local verification passed:

- `npm.cmd test --workspace=@aif/shared -- --run src/__tests__/permissionPolicy.test.ts`
  - Result: pass, 11 tests.
- `npm.cmd test --workspace=@aif/runtime -- --run src/__tests__/qwenLocalAgent.test.ts`
  - Result: pass, 40 tests.
- `npm.cmd test --workspace=@aif/api -- --run src/__tests__/runtimeService.test.ts src/__tests__/chat.test.ts`
  - Result: pass, 72 tests.
- `npm.cmd test --workspace=@aif/data -- --run src/__tests__/index.test.ts`
  - Result: pass.
- `npm.cmd test --workspace=@aif/agent -- --run src/__tests__/subagentQuery.test.ts`
  - Result: pass, 36 tests.
- `npm.cmd run build`
  - Result: pass, 7 packages.
- `npm.cmd run lint`
  - Result: pass, 10 tasks.

Independent tester gate `019e3530-6b40-7853-87d9-e182ec5ab95a` returned `TEST PASS` after running focused policy, runtime, data, API, agent, build, and lint verification.

## Review Rework

Final review gate `019e3530-9bf1-7151-ad47-7ce4ab77ce23` returned `REVIEW FAIL` with three required changes:

- Add `result.md` with implementation and verification evidence.
- Add targeted tests for bypass activity audit markers.
- Add direct WebSocket serialization redaction tests.

Rework completed:

- Added API one-shot bypass activity marker coverage.
- Added chat bypass activity marker coverage.
- Added subagent bypass activity marker coverage.
- Added direct WebSocket serialization tests for `sendToClient` and `broadcast`.

Post-rework verification passed:

- `npm.cmd test --workspace=@aif/api -- --run src/__tests__/runtimeService.test.ts src/__tests__/chat.test.ts src/__tests__/ws.test.ts`
  - Result: pass, 76 tests.
- `npm.cmd test --workspace=@aif/agent -- --run src/__tests__/subagentQuery.test.ts`
  - Result: pass, 37 tests.
- `npm.cmd run build`
  - Result: pass, 7 packages.
- `npm.cmd run lint`
  - Result: pass, 10 tasks.

Second review gate `019e3537-eebb-7733-8925-4ca1ebc899a3` returned `REVIEW FAIL` with two required changes:

- Enforce the audit bypass policy instead of passing native provider bypass whenever `AGENT_BYPASS_PERMISSIONS` is true.
- Redact secret-like dynamic WebSocket object keys, not only values.

Second rework completed:

- Routed API one-shot, chat, and subagent bypass activation through `decidePolicyBypass`.
- Cleared native provider bypass for audit tasks and recorded `[permission-policy:bypass-blocked]`.
- Added audit-bypass-clearing tests for API one-shot, chat, and subagent execution.
- Redacted object keys in `redactPermissionPolicyValue`.
- Added direct WebSocket serialization tests for secret-like keys.

Second post-rework verification passed:

- `npm.cmd test --workspace=@aif/shared -- --run src/__tests__/permissionPolicy.test.ts`
  - Result: pass, 11 tests.
- `npm.cmd test --workspace=@aif/runtime -- --run src/__tests__/qwenLocalAgent.test.ts`
  - Result: pass, 40 tests.
- `npm.cmd test --workspace=@aif/api -- --run src/__tests__/runtimeService.test.ts src/__tests__/chat.test.ts src/__tests__/ws.test.ts`
  - Result: pass, 78 tests.
- `npm.cmd test --workspace=@aif/agent -- --run src/__tests__/subagentQuery.test.ts`
  - Result: pass, 38 tests.
- `npm.cmd run build`
  - Result: pass, 7 packages.
- `npm.cmd run lint`
  - Result: pass, 10 tasks.

## Gate Outcomes

- `PLAN FAIL`: first plan review required stronger redaction coverage and concrete fail-closed approval-bridge behavior.
- `PLAN PASS`: revised research/design/plan package was accepted after the redaction and approval-bridge changes.
- `TEST PASS`: independent tester gate `019e3530-6b40-7853-87d9-e182ec5ab95a` passed after focused policy, runtime, data, API, agent, build, and lint verification.
- `REVIEW FAIL`: final review gate `019e3530-9bf1-7151-ad47-7ce4ab77ce23` required `result.md`, bypass marker tests, and direct WebSocket serialization redaction tests.
- `REVIEW FAIL`: second review gate `019e3537-eebb-7733-8925-4ca1ebc899a3` required audit bypass-policy enforcement and redaction of secret-like dynamic WebSocket object keys.
- `REVIEW PASS`: post-rework close-out accepted the current patch after audit bypass clearing, dynamic-key redaction, focused regression tests, build, and lint passed.

No user waivers were used.

## Memory Sync

`$memsync MODE=auto LANE=work TASK_ID=work-20260515-system-tz-security-permission-policy` completed local memory artifact generation and skipped auto-publish because there were no publishable curated documents.

- Report: `docs/memory/reports/work-20260515-system-tz-security-permission-policy-memsync-report.md`
- Status: `skipped`
- Reason: `no publishable curated documents`

## Residual Risk

- WebSocket redaction is directly unit-tested with mocked sockets, not a live network socket integration test.
- The current worktree contains many unrelated pre-existing changes from adjacent System TZ work; this result covers only the permission policy and redaction changes listed above.
