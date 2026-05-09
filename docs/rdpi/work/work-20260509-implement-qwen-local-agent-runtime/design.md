# Design - Implement Qwen Local Agent Runtime

Task ID: `work-20260509-implement-qwen-local-agent-runtime`
Lane: `work`
Date: 2026-05-09

## Approach

Add a built-in runtime adapter named `qwen-local-agent` under `packages/runtime/src/adapters/qwenLocalAgent/`. The adapter uses the existing `api` transport and owns the tool loop instead of delegating to Codex app-server.

The adapter calls OpenAI-compatible chat completions with function-style tools:

```json
{ "type": "function", "function": { "name": "...", "parameters": { "...": "..." } } }
```

The loop appends assistant tool calls and `role: "tool"` results back into chat history until the model returns final content or max tool turns are exceeded.

## Runtime Shape

- Runtime id: `qwen-local-agent`
- Provider id: `qwen`
- Default transport: `api`
- Supported transports: `api`
- Capabilities: no resume/session list/session fork, no streaming in first implementation, model discovery via `/models`, custom endpoint true, approvals false, usage reporting partial.

## Tool Execution Model

All tools run in-process under AIF control and are bounded to `input.projectRoot`.

Minimum tools:

- `list_files`
- `read_file`
- `write_file`
- `apply_patch`
- `run_shell`
- `git_status`
- `git_commit`

Safety rules:

- Resolve file, patch, shell cwd, and git paths inside the real project root.
- Reject absolute paths, `..` escapes, symlink/junction components, and realpath escapes.
- Deny secret-like paths and VCS control paths.
- Use `spawn` with `shell: false`; expose only structured commands.
- Keep the first shell command set conservative: `pwd` and `ls` only.
- Do not expose interpreters, package-manager scripts, or generic file-content commands through `run_shell`.
- Use a sanitized subprocess environment and exclude provider/API key variables by default.
- Redact stdout, stderr, provider payloads, tool arguments, tool names/ids, touched files, and error text before runtime/activity logging.
- Stage only explicit validated paths in `git_commit`, and disable Git hooks.

## Code Organization

- `packages/runtime/src/adapters/qwenLocalAgent/index.ts`
- `packages/runtime/src/adapters/qwenLocalAgent/api.ts`
- `packages/runtime/src/adapters/qwenLocalAgent/tools.ts`
- `packages/runtime/src/adapters/qwenLocalAgent/errors.ts`
- `packages/runtime/src/__tests__/qwenLocalAgent.test.ts`

Existing files to update:

- `packages/runtime/src/bootstrap.ts`
- `packages/runtime/src/index.ts`
- `packages/runtime/src/resolution.ts`
- `packages/runtime/src/__tests__/bootstrap.test.ts`
- `packages/runtime/src/__tests__/timeoutCoverage.test.ts`
- `packages/runtime/src/__tests__/resolution.test.ts`
- `docs/providers.md`

## Live Acceptance

After implementation and local verification, deploy to `67`, use a narrow explicit Bot Intevra profile, run a canary that creates and commits `audit/test-agent-runtime.md`, and verify raw inference services on `62` remain untouched.
