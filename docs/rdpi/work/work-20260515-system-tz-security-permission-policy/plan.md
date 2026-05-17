# Plan

```aif-plan-manifest
{
  "version": 1,
  "taskId": "work-20260515-system-tz-security-permission-policy",
  "intent": "feature",
  "scope": [
    "packages/shared/src/permissionPolicy.ts",
    "packages/shared/src/index.ts",
    "packages/shared/src/browser.ts",
    "packages/shared/src/auditEvidenceLedger.ts",
    "packages/shared/src/__tests__/auditEvidenceLedger.test.ts",
    "packages/shared/src/__tests__/permissionPolicy.test.ts",
    "packages/shared/src/__tests__/runtimeLimitUtils.test.ts",
    "packages/runtime/src/types.ts",
    "packages/runtime/src/adapters/qwenLocalAgent/tools.ts",
    "packages/runtime/src/adapters/codex/api.ts",
    "packages/runtime/src/adapters/openrouter/api.ts",
    "packages/runtime/src/adapters/opencode/api.ts",
    "packages/runtime/src/__tests__/codexAgentApi.test.ts",
    "packages/runtime/src/__tests__/openrouterApi.test.ts",
    "packages/runtime/src/__tests__/opencodeApi.test.ts",
    "packages/runtime/src/__tests__/qwenLocalAgent.test.ts",
    "packages/agent/src/subagentQuery.ts",
    "packages/agent/src/__tests__/subagentQuery.test.ts",
    "packages/api/src/services/runtime.ts",
    "packages/api/src/routes/chat.ts",
    "packages/api/src/ws.ts",
    "packages/api/src/__tests__/chat.test.ts",
    "packages/api/src/__tests__/runtimeService.test.ts",
    "packages/data/src/index.ts",
    "packages/data/src/__tests__/index.test.ts",
    "docs/configuration.md",
    "docs/providers.md",
    "docs/rdpi/work/work-20260515-system-tz-security-permission-policy"
  ],
  "allowedChanges": [
    "source",
    "tests",
    "docs",
    "rdpi"
  ],
  "forbiddenChanges": [
    "generated Codex app-server files",
    "database schema migration",
    "new approval UI",
    "runtime service probing",
    "child task execution",
    "secrets"
  ],
  "expectedArtifacts": [
    {
      "kind": "source_diff",
      "paths": [
        "packages/shared/src/permissionPolicy.ts",
        "packages/shared/src/auditEvidenceLedger.ts",
        "packages/runtime/src/types.ts",
        "packages/runtime/src/adapters/codex/api.ts",
        "packages/runtime/src/adapters/openrouter/api.ts",
        "packages/runtime/src/adapters/opencode/api.ts",
        "packages/runtime/src/adapters/qwenLocalAgent/tools.ts",
        "packages/agent/src/subagentQuery.ts",
        "packages/api/src/services/runtime.ts",
        "packages/api/src/routes/chat.ts",
        "packages/api/src/ws.ts",
        "packages/data/src/index.ts"
      ]
    },
    {
      "kind": "test_diff",
      "paths": [
        "packages/shared/src/__tests__/permissionPolicy.test.ts",
        "packages/shared/src/__tests__/auditEvidenceLedger.test.ts",
        "packages/shared/src/__tests__/runtimeLimitUtils.test.ts",
        "packages/runtime/src/__tests__/codexAgentApi.test.ts",
        "packages/runtime/src/__tests__/openrouterApi.test.ts",
        "packages/runtime/src/__tests__/opencodeApi.test.ts",
        "packages/runtime/src/__tests__/qwenLocalAgent.test.ts",
        "packages/agent/src/__tests__/subagentQuery.test.ts",
        "packages/api/src/__tests__/chat.test.ts",
        "packages/api/src/__tests__/runtimeService.test.ts",
        "packages/data/src/__tests__/index.test.ts"
      ]
    },
    {
      "kind": "docs_diff",
      "paths": [
        "docs/configuration.md",
        "docs/providers.md"
      ]
    },
    {
      "kind": "rdpi_result",
      "paths": [
        "docs/rdpi/work/work-20260515-system-tz-security-permission-policy/result.md"
      ]
    }
  ],
  "acceptanceCriteria": [
    {
      "id": "ac-1",
      "description": "Shared permission modes include danger_full_access, workspace_write, read_only, review_only, and audit_diagnostic_only.",
      "verification": "npm.cmd run test --workspace=@aif/shared -- src/__tests__/permissionPolicy.test.ts"
    },
    {
      "id": "ac-2",
      "description": "Task intent execution policy maps feature, fix, tests, docs, spike, and audit to explicit default permission modes and allowed exceptions.",
      "verification": "npm.cmd run test --workspace=@aif/shared -- src/__tests__/permissionPolicy.test.ts"
    },
    {
      "id": "ac-3",
      "description": "Audit and docs policies carry no-source/config/test and no-source boundaries respectively, and existing changed-file completion guards remain intact.",
      "verification": "npm.cmd run test --workspace=@aif/shared -- src/__tests__/taskIntent.test.ts src/__tests__/permissionPolicy.test.ts"
    },
    {
      "id": "ac-4",
      "description": "Dangerous shell commands can be classified and Qwen local run_shell blocks them through shared policy before process spawn.",
      "verification": "npm.cmd run test --workspace=@aif/runtime -- src/__tests__/qwenLocalAgent.test.ts"
    },
    {
      "id": "ac-5",
      "description": "Human approval requirements are represented explicitly, dangerous command approval without a bridge fails closed, and adapters keep existing native approval behavior without inventing an approval UI.",
      "verification": "npm.cmd run test --workspace=@aif/shared -- src/__tests__/permissionPolicy.test.ts && npm.cmd run test --workspace=@aif/runtime -- src/adapters/codex/appServer/__tests__/eventMapper.test.ts"
    },
    {
      "id": "ac-6",
      "description": "Runtime execution intents carry resolved permission policy, and bypass requests are written as redacted audited activity entries.",
      "verification": "npm.cmd run test --workspace=@aif/agent -- src/__tests__/subagentQuery.test.ts && npm.cmd run test --workspace=@aif/api -- src/__tests__/runtimeService.test.ts"
    },
    {
      "id": "ac-7",
      "description": "Secret-like content is redacted before memory approval/retrieval, audit evidence persistence, runtime/provider logs, task activity-log persistence, chat transcript persistence, and WebSocket send/broadcast payload serialization.",
      "verification": "npm.cmd run test --workspace=@aif/shared -- src/__tests__/auditEvidenceLedger.test.ts src/__tests__/runtimeLimitUtils.test.ts && npm.cmd run test --workspace=@aif/runtime -- src/__tests__/codexAgentApi.test.ts src/__tests__/openrouterApi.test.ts src/__tests__/opencodeApi.test.ts src/__tests__/qwenLocalAgent.test.ts && npm.cmd run test --workspace=@aif/data -- src/__tests__/index.test.ts && npm.cmd run test --workspace=@aif/api -- src/__tests__/chat.test.ts"
    },
    {
      "id": "ac-8",
      "description": "Provider/configuration docs describe shared permission modes, adapter translation, human approval bridge limitation, and bypass audit visibility.",
      "verification": "rg -n \"audit_diagnostic_only|review_only|Bypass|approval bridge\" docs/configuration.md docs/providers.md"
    }
  ],
  "verificationCommands": [
    "npm.cmd run test --workspace=@aif/shared -- src/__tests__/permissionPolicy.test.ts src/__tests__/taskIntent.test.ts src/__tests__/auditEvidenceLedger.test.ts src/__tests__/runtimeLimitUtils.test.ts",
    "npm.cmd run test --workspace=@aif/runtime -- src/__tests__/qwenLocalAgent.test.ts src/__tests__/codexAgentApi.test.ts src/__tests__/openrouterApi.test.ts src/__tests__/opencodeApi.test.ts src/adapters/codex/appServer/__tests__/eventMapper.test.ts",
    "npm.cmd run test --workspace=@aif/agent -- src/__tests__/subagentQuery.test.ts",
    "npm.cmd run test --workspace=@aif/api -- src/__tests__/runtimeService.test.ts src/__tests__/chat.test.ts",
    "npm.cmd run test --workspace=@aif/data -- src/__tests__/index.test.ts",
    "npm.cmd run build --workspace=@aif/shared",
    "npm.cmd run build --workspace=@aif/runtime",
    "npm.cmd run build --workspace=@aif/agent",
    "npm.cmd run build --workspace=@aif/api",
    "npm.cmd run build --workspace=@aif/data",
    "git diff --check"
  ]
}
```

## Checklist

- [x] Add shared `permissionPolicy.ts` with canonical permission modes, per-intent mappings, dangerous command detection, and recursive redaction helpers.
- [x] Add shared shell/approval decision helpers that return fail-closed denial when a dangerous command requires human approval but no bridge is available.
- [x] Export the shared policy from `@aif/shared` server and browser entry points.
- [x] Extend `RuntimeExecutionIntent` with optional `permissionPolicy`.
- [x] Resolve and pass permission policy in agent subagent execution, API runtime service execution, and chat execution.
- [x] Add bypass audit visibility in task activity logs without storing raw secrets.
- [x] Wire Qwen local `run_shell` through the shared dangerous-command classifier.
- [x] Redact before persistence in task activity logs and chat messages.
- [x] Redact before WebSocket `sendToClient` and `broadcast` serialization.
- [x] Add focused shared/runtime/agent/API/data tests for policy mapping, dangerous shell blocking, human-approval fail-closed decisions, runtime propagation, bypass audit, and redaction boundaries.
- [x] Preserve or add explicit tests covering memory redaction, audit evidence redaction, and runtime/provider log redaction so every intake redaction target is verified.
- [x] Update `docs/configuration.md` and `docs/providers.md`.
- [x] Run the verification commands.
- [x] Record gate outcomes, implementation summary, verification, and memsync status in `result.md`.

## Plan Review History

- `PLAN FAIL` on first review: redaction verification omitted memory/evidence/runtime logs, and human approval bridge behavior was not concrete enough.
- Revision: added explicit approval decision helpers with bridge-absent fail-closed behavior, expanded redaction acceptance criteria to every intake target, and added targeted verification commands for memory, audit evidence, runtime/provider logs, activity logs, WebSocket payloads, and chat transcript persistence.
- `PLAN PASS`: independent plan review accepted the revised plan after the redaction and approval-bridge revisions.

## Gate Requirements

- Independent `PLAN PASS` is required before implementation.
- Independent `TEST PASS` is required after implementation.
- Independent `REVIEW PASS` is required after `TEST PASS`.
- If any gate fails, revise and rerun the invalidated gate before close-out.
