# Plan - 05_allowed_write_paths_tool_policy

```aif-plan-manifest
{
  "version": 1,
  "taskId": "05_allowed_write_paths_tool_policy",
  "intent": "fix",
  "scope": [
    "packages/agent/src/implementationRecoveryPack.ts",
    "packages/agent/src/subagents/implementer.ts",
    "packages/agent/src/subagentQuery.ts",
    "packages/agent/src/__tests__/implementationRecoveryPack.test.ts",
    "packages/agent/src/__tests__/implementer.test.ts",
    "packages/runtime/src/adapters/qwenLocalAgent/tools.ts",
    "packages/runtime/src/adapters/qwenLocalAgent/api.ts",
    "packages/runtime/src/__tests__/qwenLocalAgent.test.ts",
    "docs/rdpi/work/05_allowed_write_paths_tool_policy/result.md"
  ],
  "allowedChanges": [
    "source",
    "tests",
    "docs"
  ],
  "forbiddenChanges": [
    "dependency",
    "config",
    "unrelated_docs",
    "generated_runtime",
    "broad_refactor"
  ],
  "expectedArtifacts": [
    {
      "kind": "source_diff",
      "paths": [
        "packages/agent/src/implementationRecoveryPack.ts",
        "packages/agent/src/subagents/implementer.ts",
        "packages/agent/src/subagentQuery.ts",
        "packages/runtime/src/adapters/qwenLocalAgent/tools.ts",
        "packages/runtime/src/adapters/qwenLocalAgent/api.ts"
      ]
    },
    {
      "kind": "test_delta",
      "paths": [
        "packages/agent/src/__tests__/implementationRecoveryPack.test.ts",
        "packages/agent/src/__tests__/implementer.test.ts",
        "packages/runtime/src/__tests__/qwenLocalAgent.test.ts"
      ]
    },
    {
      "kind": "docs_diff",
      "paths": [
        "docs/rdpi/work/05_allowed_write_paths_tool_policy/result.md"
      ]
    }
  ],
  "acceptanceCriteria": [
    {
      "id": "AC1",
      "description": "Write-path denials return failed tool results with ok === false, error starting with write_path_not_allowed: <path>, and policyViolation === true; other hard tool-policy denials also set policyViolation === true.",
      "verification": "npm.cmd test --workspace=@aif/runtime -- --run src/__tests__/qwenLocalAgent.test.ts"
    },
    {
      "id": "AC2",
      "description": "A policy-violation tool result stops the Qwen local-agent loop before a follow-up model/tool turn can run.",
      "verification": "npm.cmd test --workspace=@aif/runtime -- --run src/__tests__/qwenLocalAgent.test.ts"
    },
    {
      "id": "AC3",
      "description": "git_commit denies pre-existing staged files outside allowed write paths before creating a commit.",
      "verification": "npm.cmd test --workspace=@aif/runtime -- --run src/__tests__/qwenLocalAgent.test.ts"
    },
    {
      "id": "AC4",
      "description": "Audit/report mode allows only the expected report artifact and denies source/config/test writes.",
      "verification": "npm.cmd test --workspace=@aif/runtime -- --run src/__tests__/qwenLocalAgent.test.ts"
    },
    {
      "id": "AC5",
      "description": "Broad git operations are denied or unreachable through run_shell and package-manager wrappers, while explicit scoped git_commit succeeds.",
      "verification": "npm.cmd test --workspace=@aif/runtime -- --run src/__tests__/qwenLocalAgent.test.ts"
    },
    {
      "id": "AC6",
      "description": "Feature/fix/docs/tests implementation runs derive runtime allowedWritePaths from aif-plan-manifest scope and expectedArtifacts.",
      "verification": "npm.cmd test --workspace=@aif/agent -- --run src/__tests__/implementer.test.ts"
    },
    {
      "id": "AC7",
      "description": "Destructive shell/script forms such as rm -rf, find -delete, and sed -i remain denied before execution.",
      "verification": "npm.cmd test --workspace=@aif/runtime -- --run src/__tests__/qwenLocalAgent.test.ts"
    },
    {
      "id": "AC8",
      "description": "Implementation recovery proposed children carry explicit fileBoundaries derived from the source plan-manifest scope plus expectedArtifacts, so recovery child tasks inherit the approved write boundary.",
      "verification": "npm.cmd test --workspace=@aif/agent -- --run src/__tests__/implementationRecoveryPack.test.ts"
    }
  ],
  "verificationCommands": [
    "npm.cmd test --workspace=@aif/runtime -- --run src/__tests__/qwenLocalAgent.test.ts",
    "npm.cmd test --workspace=@aif/agent -- --run src/__tests__/implementationRecoveryPack.test.ts",
    "npm.cmd test --workspace=@aif/agent -- --run src/__tests__/implementer.test.ts",
    "npm.cmd run lint --workspace=@aif/runtime",
    "npm.cmd run lint --workspace=@aif/agent"
  ]
}
```

## Steps

1. Update `tools.ts` to mark hard write/tool policy denials with `policyViolation: true`.
2. Update `qwenToolResultForModel` so the model-facing JSON includes `policyViolation`.
3. Add a staged-file preflight in `gitCommitTool` using `git diff --cached --name-only`, checking every staged path against the existing write-path policy before any commit is attempted.
4. Add explicit broad-git package-manager script denial for `git add .`, `git add -A`, `git add --all`, `git commit -a`, and related `git add`/`git commit` wrapper forms. Keep raw `git` unavailable through `run_shell`.
5. Update `api.ts` so emitted tool-result events include `policyViolation` and the run throws a permission error immediately after a policy-violation result is emitted.
6. Add/extend focused tests in `qwenLocalAgent.test.ts` for:
   - direct denial shape with `ok === false`, `error` starting with `write_path_not_allowed: <path>`, `policyViolation === true`, and model serialization preserving the marker,
   - policy-violation loop stop,
   - audit report write allowed and source/config/test write denied,
   - staged-outside-allowed `git_commit` denial,
   - explicit scoped `git_commit` success,
   - broad git denial through raw `run_shell` and package-manager wrappers,
   - destructive shell/script denial.
7. Update `implementationRecoveryPack.ts` so recovery split proposal children include `fileBoundaries` derived from the current task's plan-manifest `scope` plus `expectedArtifacts`; fall back only to known changed-file paths if no manifest is parseable.
8. Add/extend `implementationRecoveryPack.test.ts` to assert recovery proposed children carry those derived `fileBoundaries`.
9. Add/extend `implementer.test.ts` to assert plan-manifest `scope` plus `expectedArtifacts` are forwarded as runtime `allowedWritePaths` for implementation-mode work. If the existing source path already passes, this is a regression test only; if not, adjust `implementer.ts`/`subagentQuery.ts` within the declared scope.
10. Run focused runtime tests.
11. Run focused agent tests.
12. Run runtime and agent lint if focused tests pass.
13. Record gate outcomes and verification in `result.md`.

## Gate requirements

- Independent `PLAN PASS` required before code edits.
- Independent `TEST PASS` required after implementation.
- Independent final `REVIEW PASS` required before close-out.
