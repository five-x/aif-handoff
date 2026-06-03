# Design - 05_allowed_write_paths_tool_policy

## Objective

Harden the existing Qwen local-agent tool/runtime enforcement so `allowedWritePaths` is a hard runtime policy instead of a prompt-only convention.

## Scope

In scope:

- Add a structured policy-violation result marker for write-path and tool-policy denials.
- Preserve the existing `write_path_not_allowed: <path>` error prefix for denied paths.
- Include `policyViolation: true` in model-facing tool results and activity-log tool result data.
- Stop the Qwen local-agent loop immediately when a tool result is a policy violation, preventing the model from continuing after a hard write-policy denial.
- Add a `git_commit` preflight that fails if the index already contains staged files outside the allowed write scope.
- Add explicit broad-git denial for package-manager script wrappers that attempt `git add .`, `git add -A`, `git commit -a`, or other `git add`/`git commit` forms. The structured `git_commit` tool remains the only commit path for Qwen local-agent repository tools.
- Add focused tests for structured denial shape, loop stop behavior, staged-outside-allowed commit denial, audit report-only writes, destructive shell denial, broad git denial, explicit scoped commit success, and implementation manifest-derived allowed paths.
- Add explicit recovery child write boundaries by populating implementation recovery split proposal `fileBoundaries` from the approved plan-manifest boundary.

Out of scope:

- Introducing a new shared `toolWritePolicy.ts` abstraction unless implementation shows the existing local helper cannot stay coherent.
- Changing task planner, coordinator, or UI behavior.
- Supporting a raw `git_add` shell/tool path; the current Qwen tool API has no raw git shell command and `git_commit` already stages explicit paths with `git add --`.

Existing upstream manifest derivation is in scope for regression coverage, not a new source implementation:

- `packages/agent/src/subagents/implementer.ts` already derives implementation-mode `allowedWritePaths` from `aif-plan-manifest.scope` and `expectedArtifacts`.
- `packages/agent/src/subagentQuery.ts` already forwards sanitized workflow metadata to `RuntimeExecutionIntent.allowedWritePaths`.
- Add/adjust tests to lock this behavior and catch future regressions.

Existing recovery-child scope derivation needs source coverage:

- The codebase has no literal `recoveryChildScope` field.
- Implementation recovery children are represented as split proposal entries with optional `fileBoundaries`.
- The roadmap generation path turns proposal child `fileBoundaries` into child microtask metadata and a child `aif-plan-manifest.scope` plus `expectedArtifacts`.
- Add/adjust implementation recovery pack code so each proposed recovery child carries explicit `fileBoundaries` derived from the source task plan manifest. Use `aif-plan-manifest.scope` plus `expectedArtifacts`; if a legacy recovery pack lacks a parseable manifest, fall back only to known changed-file paths already present in the recovery summary.

## Implementation approach

1. Represent policy violations in `tools.ts`.

- Extend tool result shape informally with optional `policyViolation: true`.
- Add a small helper for deliberate hard tool-policy denials. Prefer creating/throwing policy-marked `RuntimeExecutionError` instances for write-path denials, generated/dependency write denials, destructive shell-wrapper denials, broad git wrapper denials, and staged-outside-allowed commit denials.
- In the `executeQwenLocalTool` catch path, return `policyViolation: true` for classified policy denials.
- For denied paths, tests must assert the concrete shape: `ok === false`, `error` begins with `write_path_not_allowed: <path>`, and `policyViolation === true`.
- Ensure normal command failures, timeouts, and transport-like tool failures remain ordinary failed tool results.

2. Preserve and propagate the marker.

- Update `qwenToolResultForModel` to include `policyViolation: true` when present.
- Update `emitToolResult` in `api.ts` to include `policyViolation: true` in event data.
- In the tool loop, after emitting the tool result and audit evidence, if `result.policyViolation === true`, throw a `RuntimeExecutionError` with category `permission` and provider metadata identifying `policy_violation`, the tool name, and the target path when available.
- This should stop the run rather than allowing a new agent loop after a hard policy denial.

3. Check staged files before `git_commit`.

- Before running `git add -- ...paths`, inspect staged names with `git diff --cached --name-only --diff-filter=ACMRTUXB`.
- Normalize each staged path through existing project-root path checks.
- If any staged file is outside `allowedWritePaths` or in generated/dependency dirs, fail with `write_path_not_allowed: <path>` and `policyViolation: true`.
- Keep the existing explicit `git add -- ...relativePaths` and explicit commit pathspec.
- If no explicit `allowedWritePaths` is configured, still reject generated/dependency staged paths through the existing generated-dir boundary.

4. Deny broad git wrappers.

- Keep raw `git` unavailable in `run_shell`.
- Add explicit package-manager script detection for broad git staging/commit forms, including `git add .`, `git add -A`, `git add --all`, and `git commit -a`.
- Fail closed before executing the package-manager script and mark the result as `policyViolation: true`.
- Route allowed explicit commits through `git_commit` only.

5. Tests.

- Extend `packages/runtime/src/__tests__/qwenLocalAgent.test.ts`.
- Assert direct tool denials include `policyViolation: true` and model serialization includes the marker.
- Assert denied path results include all required fields exactly enough to catch regressions: failed `ok`, `write_path_not_allowed: <path>` error text, and `policyViolation: true`.
- Add a run-level test where `write_file` tries to write outside `allowedWritePaths`; assert the run rejects with permission/provider metadata and that no follow-up tool turn is executed.
- Add a git test that stages an outside-scope file manually, calls `git_commit` for an allowed path, and asserts denial before commit with no commit created.
- Add/extend regression tests for audit report mode: report artifact write allowed and source/config/test write denied.
- Add/extend regression tests for broad git denial: raw `run_shell` `git add .` is unsupported and package-manager wrappers containing broad git staging/commit are denied before execution.
- Add/extend regression tests for explicit scoped `git_commit` success.
- Add/extend regression tests for destructive shell/script denial such as `rm -rf`, `find ... -delete`, or `sed -i`.
- Add an agent-level regression test in `packages/agent/src/__tests__/implementer.test.ts` proving a feature/fix/docs/tests plan with `aif-plan-manifest.scope` and `expectedArtifacts` passes their union as runtime workflow metadata `allowedWritePaths`.
- Add an agent-level regression test in `packages/agent/src/__tests__/implementationRecoveryPack.test.ts` proving implementation recovery proposed children carry explicit `fileBoundaries` derived from plan-manifest `scope` plus `expectedArtifacts`.

## Risks and mitigations

- Risk: classifying too many permission failures as hard policy violations could stop runs on ordinary unsupported commands.
  - Mitigation: classify only policy-marked errors and known write-path/broad-git/destructive-wrapper denials needed by this task.
- Risk: staged-file inspection could be brittle across platforms.
  - Mitigation: use `git diff --cached --name-only` with existing `spawnProcess`, normalize path separators, and test through real temporary git repos.
- Risk: stopping after policy violations could change current loop behavior.
  - Mitigation: target only `policyViolation === true`; normal failed verification commands still return to the model.

## Acceptance mapping

- Allowed write paths enforced by code: existing enforcement remains and gets structured hard-stop semantics.
- Policy denial does not start a new agent loop: `api.ts` throws after emitting a policy-violation result.
- Activity log contains `write_path_not_allowed`: existing error text remains in tool result event data.
- Tests verify actual tool execution refusal: direct tool and run-loop tests exercise the real tool path.
- Implementation-mode manifest derivation: agent regression test proves `aif-plan-manifest.scope` and `expectedArtifacts` become runtime `allowedWritePaths`.
- Recovery child scope: implementation recovery proposed children carry `fileBoundaries` so child microtasks inherit the same approved write boundary.
- Git policy: broad git forms are denied or unreachable; explicit scoped `git_commit` remains allowed and staged-outside paths are denied.
