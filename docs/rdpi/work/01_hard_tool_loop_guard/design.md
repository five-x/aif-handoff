# Design - 01_hard_tool_loop_guard

## Scope

Implement the hard repeated-tool-call guard for the AIF-owned `qwen-local-agent` function-tool loop across all supported AIF workflow stages that can use that adapter. Preserve the existing stage-cap policy and existing file-state-aware retry behavior for audit/report artifacts.

This design does not add a universal interceptor to Codex, Claude, OpenRouter, or OpenCode adapters. Those adapters do not all expose the same pre-execution function-tool loop that `qwen-local-agent` owns. If a later acceptance gate requires adapter-universal enforcement, queue it as a separate task after this qwen-local-agent hardening lands.

## Current baseline

- `runtimeStagePolicy.ts` already provides strict default `repeatedToolCallLimit: 2` for required stages.
- `subagentQuery.ts` already caps adapter options with stricter stage caps.
- `qwenLocalAgent/api.ts` already:
  - computes normalized call identity;
  - applies global and special tool limits;
  - blocks before `executeQwenLocalTool`;
  - emits a `repeated_tool_loop_blocked` runtime event.

## Proposed changes

1. Fingerprint contract
   - Introduce a stable fingerprint input object with:
     - `workflowKind`
     - `stage`
     - `toolName`
     - `cwd`
     - `normalizedArgs`
     - `targetPath`
     - `allowedWritePaths`
   - Apply the task-required normalization rules:
     - normalize paths to `/`;
     - remove leading `./`;
     - collapse duplicate path separators;
     - sort JSON object keys recursively;
     - make shell fingerprinting depend on `command`, ordered `args`, and normalized `cwd`;
     - make `read_file` fingerprinting depend on normalized `path`, `startLine`, `lineCount`, and related range/offset inputs;
     - make `search_files` fingerprinting depend on query text plus normalized scope/path and search flags;
     - make `git_status` fingerprinting include path filters if the tool grows or already receives them;
     - make `git_commit` fingerprinting include normalized staged paths and audit artifact path/state.
   - Keep audit/report file-state data as an internal extension so repaired artifacts can change the fingerprint and allow one bounded retry after real content delta.
   - Hash the stable input with SHA-256.
   - Use the hash string as the public `fingerprint` value in blocked events/provider meta.
   - Preserve the normalized object under an internal diagnostic key such as `fingerprintInput` only where tests/internal diagnostics need it.

2. Stage normalization
   - Add a qwen-local-agent local workflow-to-stage mapping aligned with `subagentQuery.ts`:
     - `planner` -> `planner`
     - `plan-checker` -> `plan_checker`
     - `implementer` -> `implementer`
     - `reviewer` -> `reviewer`
     - `qa` -> `qa`
     - `audit` -> `audit`
     - `synthesis` -> `synthesis`
     - known security/research/design variants to their existing stages where useful
   - Include `stage` in event data and fingerprint input.

3. Special limit semantics
   - Preserve stricter special caps:
     - `git_commit`: max 1 same artifact/state attempt
     - `finalize_audit_report_manifest`: max 2 per artifact/state
     - `validate_audit_report`: max 2 per artifact/state
     - `read_file`: same path/range limited by existing special cap
     - `list_files`: same path limited by existing special cap
     - `git_status`: same clean state limited by existing special cap
   - Keep current nonconsecutive loop tracking for loop-prone tools.
   - Prefer the stricter of stage cap and special cap.

4. Blocked behavior
   - Keep the guard before `executeQwenLocalTool`.
   - Emit `repeated_tool_loop_blocked` with:
     - `stage`
     - `toolName`
     - `repeatedCount`
     - `repeatedToolCallLimit`
     - `fingerprint`
     - `targetPath`
   - Keep raw provider text out of user-facing fields.

5. Task blocked reason classification
   - Add a specific `stageErrorHandler.ts` path for provider status `repeated_tool_loop_blocked`.
   - For implementer stage, produce:
     - `implementation_tool_loop: <toolName> repeated <count>/<limit>`
   - For audit/report stages, produce:
     - `repeated_tool_loop: <toolName> repeated <count>/<limit>; artifact=<path>`
   - For other stages, produce:
     - `repeated_tool_loop: <toolName> repeated <count>/<limit>`
   - Include only sanitized tool name, counts, limit, and normalized artifact/target path.

6. Durable activity log
   - In `subagentQuery.ts`, persist runtime event type `repeated_tool_loop_blocked` to task activity:
     - `repeated_tool_loop_blocked: stage=<stage>; tool=<tool>; limit=<limit>; fingerprint=<hash>`
   - Use event data only; do not include raw provider diagnostics.

## Test design

- Update existing qwen-local-agent tests to expect hashed `fingerprint` and internal `fingerprintInput`.
- Add/adjust tests for:
  - third identical `read_file(path=A)` blocks;
  - equivalent `read_file` paths using `\`, `/`, and `./` normalize to the same fingerprint input;
  - repeated `list_files(path=A)` blocks;
  - `search_files` includes query, normalized scope/path, and flags in the fingerprint input;
  - `run_shell` includes command, ordered args, and normalized cwd in the fingerprint input;
  - repeated clean `git_status` blocks;
  - repeated `git_commit` without artifact delta blocks while still allowing a retry after content delta;
  - `audit` and `synthesis` stage caps remain `2`;
  - blocked repeated calls do not emit a `tool:result` for the blocked call and do not execute the tool;
  - `repeated_tool_loop_blocked` event includes stage and hash;
  - `stageErrorHandler.ts` produces user-safe fail-closed blocked reasons;
  - `subagentQuery.ts` persists the blocked-loop activity line.

## Canary design

After implementation and targeted tests, run a post-implementation canary using the test harness or a minimal controlled qwen-local-agent run with mocked endpoint responses where the assistant repeats the same `read_file` or `git_status` call.

The canary evidence must show:

- the task/run terminates fail-closed instead of hanging;
- the blocked repeated call has no `tool:result` and no execution side effect;
- `repeated_tool_loop_blocked` is emitted with stage, tool, limit, and fingerprint hash;
- no automatic retry to a larger context/profile is triggered;
- no repeated provider session loop continues after the block.

Record the canary command and evidence summary in `result.md`.

## Risks

- Changing `fingerprint` from object to hash may require updating existing assertions.
- If hidden callers depend on the full fingerprint object in provider meta, preserving `fingerprintInput` mitigates internal observability loss.
- Over-broad adapter-universal enforcement would be riskier and is not justified by the expected task file zones.
