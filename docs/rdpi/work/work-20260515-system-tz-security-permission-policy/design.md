# Design

## Overview

Add a shared execution permission policy contract and wire it into the runtime boundary without redesigning runtime profiles or task intent. The contract will define canonical permission modes, default policy per task intent, dangerous command classification, network posture, shell posture, and whether human approval is required.

This task also adds redaction-at-boundary helpers so secret-like text is scrubbed before storage or UI delivery in the places identified by research: task activity logs, chat transcripts, and WebSocket events. Existing audit evidence and memory redaction paths remain in place.

## Shared Policy Contract

Add `packages/shared/src/permissionPolicy.ts` with:

- `EXECUTION_PERMISSION_MODES`
- `ExecutionPermissionMode`
- `ExecutionNetworkPolicy`
- `ExecutionShellPolicy`
- `ExecutionPermissionPolicy`
- `TaskIntentExecutionPolicy`
- `TASK_INTENT_EXECUTION_POLICIES`
- `getTaskIntentExecutionPolicy(intent)`
- `resolveTaskExecutionPermissionPolicy(input)`
- `evaluateHumanApprovalRequirement(input)`
- `evaluateShellCommandPermission(input)`
- `classifyDangerousShellCommand(input)`
- `isDangerousShellCommand(input)`
- `redactSecretLikeText(value)`
- `redactSecretLikePayload(value)`

Default intent mapping:

- `general`: `workspace_write`
- `feature`: `workspace_write`
- `fix`: `workspace_write`
- `tests`: `workspace_write` with limited source-hook exception described in policy metadata
- `docs`: `workspace_write` with docs-only file boundary and no source exception unless explicitly justified by task context
- `spike`: `review_only`
- `audit`: `audit_diagnostic_only`

Mode semantics:

- `danger_full_access`: bypass-capable, unrestricted shell/network subject to explicit bypass audit.
- `workspace_write`: repository workspace writes allowed, dangerous shell blocked by shared classifier, network controlled by runtime/profile.
- `read_only`: no writes, read/search only, dangerous shell blocked.
- `review_only`: research/docs/report outputs only, no source/config/test writes, dangerous shell blocked.
- `audit_diagnostic_only`: diagnostic report/evidence only, no source/config/test writes, dangerous shell blocked.

The shared policy will not replace `validateTaskIntentChangedFiles`; it will augment it. Completion evidence remains the deterministic fail-closed guard for file drift. The new policy makes the pre-execution contract visible and lets adapters enforce what they can.

## Shell And Approval Decisions

Shell policy should be represented as an explicit decision instead of a bare boolean:

- `allow`: command is permitted by the active policy.
- `deny`: command is blocked by policy.
- `requires_human_approval`: command could be permitted only through a human approval bridge.

The first implementation will make bridge absence fail closed:

- `evaluateShellCommandPermission` returns `deny` for dangerous commands when the policy would require human approval but no bridge is available.
- `evaluateHumanApprovalRequirement` records the reason and the missing bridge state so callers can surface it without inventing an approval UI.
- `danger_full_access` may allow commands only when bypass is explicitly active; that decision is still audited.

This satisfies the intake requirement to define the approval bridge boundary while keeping approval UI implementation out of this task.

## Runtime Wiring

Extend `RuntimeExecutionIntent` in `packages/runtime/src/types.ts` with an optional `permissionPolicy`.

Agent subagent execution:

- In `packages/agent/src/subagentQuery.ts`, resolve policy from the task intent and `AGENT_BYPASS_PERMISSIONS`.
- Preserve existing env/profile behavior for compatibility, but add an activity-log audit entry when bypass is requested/active.
- Pass the policy through `RuntimeExecutionIntent`.

API runtime/chat execution:

- In `packages/api/src/services/runtime.ts`, resolve a policy for task-backed one-shot runtime execution.
- In `packages/api/src/routes/chat.ts`, use a chat/general policy and include the policy in `RuntimeExecutionIntent`.

Adapter translation:

- Codex/Claude adapters continue to honor explicit profile `approvalPolicy`, `sandboxMode`, or native permission options first.
- If no explicit profile override exists, adapter defaults can use `permissionPolicy.mode` as the adapter-neutral hint:
  - `danger_full_access` -> existing bypass translation.
  - `read_only` -> read-only sandbox where supported.
  - `workspace_write`, `review_only`, `audit_diagnostic_only` -> workspace-write/accept-edits level where supported, with policy metadata available in logs/events.
- Qwen local structured tools should call the shared dangerous shell classifier before command allowlist validation so future allowlist expansion remains guarded.

Human approval bridge:

- Represent `requiresHumanApproval` in policy metadata.
- Do not implement a new approval UI in this task.
- Existing Codex app-server behavior remains fail-closed when approvals are requested without a bridge.

## Redaction Boundaries

Use shared recursive payload redaction at these persistence/send boundaries:

- `packages/data/src/index.ts`
  - `appendTaskActivityLog`: persist redacted appended lines.
  - `createChatMessage`: persist redacted chat message content and attachment metadata strings.
- `packages/api/src/ws.ts`
  - `sendToClient` and `broadcast`: serialize a redacted copy of the event payload.
- `packages/api/src/routes/chat.ts`
  - The existing WS token send path benefits from the `ws.ts` sanitizer.
  - Persisted assistant/user messages benefit from data-layer redaction.

Existing memory and audit evidence redaction stay as-is, with focused tests proving the new helper does not bypass them. Runtime/provider logging remains in adapter-specific paths, so this task will add or preserve targeted tests for runtime error/log redaction rather than moving every logger behind a new abstraction.

Verification targets for the intake redaction list:

- Memory: data-layer memory tests must prove secret-like source/content/claim text is blocked or redacted before approval/retrieval.
- Evidence: shared audit evidence tests must prove command metadata and output previews are redacted before evidence payload persistence.
- Runtime logs: runtime adapter tests must prove provider/runtime error bodies and logged raw lines are redacted.
- Activity logs: data-layer tests must prove `appendTaskActivityLog` stores redacted text.
- WebSocket payloads: API/WS tests must prove nested event payload strings are redacted before serialization.
- Chat transcript persistence: data-layer and chat route tests must prove user/assistant persisted messages are redacted.

## Documentation

Update:

- `docs/providers.md` for shared permission modes, adapter translation, and approval bridge limitation.
- `docs/configuration.md` for `AGENT_BYPASS_PERMISSIONS` visibility/audit semantics and per-intent policy defaults.

## Non-Goals

- No new DB schema.
- No generated app-server file edits.
- No full path-specific sandbox across all runtimes.
- No change to runtime budget governance or chat attachment gates.
- No broad UI redesign.
