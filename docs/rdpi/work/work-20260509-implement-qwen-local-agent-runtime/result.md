# Result - Implement Qwen Local Agent Runtime

Task ID: `work-20260509-implement-qwen-local-agent-runtime`
Lane: `work`
Date: 2026-05-09

## Outcome

Implemented the dedicated `qwen-local-agent` runtime path for local Qwen llama.cpp endpoints. The runtime is an explicit built-in adapter that uses the existing `api` transport and OpenAI-compatible chat completions with function-style tools, while AIF owns the repository tool loop.

The implementation does not replace or change the existing `codex`, `claude`, `opencode`, `openrouter`, or raw inference paths. Runtime resolution defaults `qwen-local-agent` to API, but the documented canary profile remains explicit and non-default.

## Implemented Changes

- Added `packages/runtime/src/adapters/qwenLocalAgent/` with adapter descriptor, API loop, error classification, and AIF-controlled tool executor.
- Added OpenAI-compatible tool definitions using `tools: [{ type: "function", function: ... }]` and `role: "tool"` results.
- Added bounded repo tools: `list_files`, `read_file`, `write_file`, `apply_patch`, `run_shell`, `git_status`, and `git_commit`.
- Registered `qwen-local-agent` as a built-in runtime and exported its adapter option/logger types.
- Updated runtime resolution for `QWEN_API_KEY`, `QWEN_BASE_URL`, `QWEN_MODEL`, and API default transport.
- Documented Qwen Local Agent profile shape, canary guidance, and safety model in `docs/providers.md`.
- Added focused runtime tests for request shape, tool loop behavior, path containment, shell constraints, patch/git safety, timeout handling, redaction, model discovery, validation, and unsupported transport rejection.

## Safety Model

- File, patch, shell cwd, and git paths are resolved inside the real project root and reject absolute paths, `..` escapes, symlink/junction components, and realpath escapes.
- Secret-like paths and VCS control paths are denied for file, patch, shell, and git staging operations.
- `run_shell` is not an arbitrary shell. It uses `spawn` with `shell: false`, only `pwd` and `ls`, safe flags only, no path arguments, sanitized environment, timeouts, and redacted output.
- `apply_patch` rejects quoted patch paths, unquoted whitespace paths, symlink modes, and executable modes.
- `git_commit` stages explicit validated files only and disables hooks with an empty `core.hooksPath` plus `--no-verify`.
- Pre-aborted signals block side-effect tools before writes, patches, or commits.
- Tool event logging redacts provider error text, unknown provider-supplied tool names, tool call ids, retained arguments, and touched file paths.

## Gate History

- Plan review initially returned `PLAN FAIL` because the draft shell design was too broad and Qwen default transport handling was incomplete.
- Plan review then returned `PLAN PASS`.
- Multiple review gates failed during implementation and were fixed: symlink/junction escape, shell/script bypass, shell cwd/path escape, patch path bypasses, raw tool-use details, timeout escalation, VCS/Git hook gaps, pre-aborted side effects, `dir` advertising, nested unknown arg leakage, model-discovery fallback redaction, unsupported transport acceptance in validation/model discovery, and raw provider tool names/ids/touched paths in tool events.
- Final independent tester returned `TEST PASS`.
- Final independent reviewer returned `REVIEW PASS`.

## Verification

Final required local test gate:

```text
npm.cmd run test --workspace=@aif/runtime -- src/__tests__/qwenLocalAgent.test.ts src/__tests__/bootstrap.test.ts src/__tests__/timeoutCoverage.test.ts src/__tests__/resolution.test.ts
```

Result: 4 test files passed, 80 tests passed.

```text
npm.cmd run test --workspace=@aif/runtime -- src/adapters/codex/appServer/__tests__/eventMapper.test.ts src/adapters/codex/appServer/__tests__/process.test.ts src/__tests__/codexModelDiscoveryProcess.test.ts src/__tests__/codexErrors.test.ts
```

Result: 4 test files passed, 44 tests passed.

```text
npm.cmd run build --workspace=@aif/runtime
```

Result: passed.

```text
npm.cmd run lint --workspace=@aif/runtime
```

Result: passed.

Independent final reviewer also ran a combined regression check covering 8 files and 124 tests, plus `npm.cmd run build --workspace=@aif/runtime`; both passed.

## Live Acceptance

The final implementation was deployed to `192.168.88.67` under `/opt/aif-handoff`. `api` and `agent` images were rebuilt and restarted after the final log-redaction patch.

Remote service verification:

- `curl http://192.168.88.67/api/health`: `{"status":"ok",...}`
- `docker compose ps api agent`: both containers running after rebuild.

Live Qwen Local Agent tool-loop canary:

- Task ID: `e1f2266e-62d1-442c-b93f-be391e04e403`
- Project workspace: `/srv/aif-handoff/projects/botIntevra`
- Branch: `feature/full-project-audit-across-all-available-d2c6d0`
- Commit: `48a2973`
- File: `audit/test-agent-runtime.md`
- Commit message: `Update agent runtime canary report after nested argument sanitization`

That canary created and committed `audit/test-agent-runtime.md` through the new `qwen-local-agent` runtime. The last two hardening fixes after that canary were transport rejection for validation/model discovery and event-log redaction for provider tool names/ids/touched files; both were covered by local tests, final gates, and deployed to `67`.

The protected raw Qwen inference endpoints on `192.168.88.62` were not modified.

## Memory Sync

- Report: `docs/memory/reports/work-20260509-implement-qwen-local-agent-runtime-memsync-report.md`
- Status: `skipped`
- Reason: `no publishable curated documents`

## Conclusion

`qwen-local-agent` is now a narrow explicit runtime path for local Qwen agent work. It avoids the Codex Responses tool-schema incompatibility by using function-style tools and keeps repository side effects inside AIF-controlled, logged, redacted, project-root-bounded tooling.
