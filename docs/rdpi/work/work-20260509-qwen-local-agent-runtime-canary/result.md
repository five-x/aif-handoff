# Result - Qwen Local Agent Runtime Canary

Task ID: `work-20260509-qwen-local-agent-runtime-canary`
Lane: `work`
Date: 2026-05-09

## Outcome

The canary disproved the `codex app-server -> llama.cpp` path for the current Qwen endpoint as a working AIF agent runtime.

AIF profile isolation and provider routing worked, and `codex app-server` reached the local Qwen provider. The run failed before file, shell, git, or tool execution because llama.cpp rejected the Codex Responses tool schema:

```text
'type' of tool must be 'function'
```

The follow-up implementation should therefore be a dedicated AIF local-agent runtime/tool-loop adapter, not more changes to `codex app-server` or raw `8003`/`8004` endpoints.

## Implemented Changes

- Added profile-level `codexHome` support for Codex app-server process isolation.
- Added tests proving `CODEX_HOME` is set for app-server process execution and model discovery.
- Documented `codexHome` and local OpenAI-compatible provider constraints in `docs/providers.md`.
- Added Codex app-server diagnostics for `systemError` followed by provider `error` notifications.
- Added provider error normalization/classification for OpenAI-compatible `invalid_request_error` payloads.
- Deployed changes to `192.168.88.67` and restarted `api` / `agent`.
- Created isolated deployed Codex config at `/data/codex-qwen-canary/config.toml`.
- Kept `192.168.88.62` inference services untouched.

## Deployed Canary Profile

- Profile ID: `2f66c8b9-583d-4978-9ff5-a7e3f24b9e3b`
- Name: `QwenLocalAgent Canary`
- Project: `e4a3a101-ec7f-4f93-9b68-e297ffe8952f`
- Runtime: `codex`
- Transport: `app-server`
- Model: `Qwen3-32B-Q4_K_M.gguf`
- Base URL: existing protected Qwen endpoint on `8003`
- Options included `codexHome=/data/codex-qwen-canary`, `approvalPolicy=never`, `sandboxMode=workspace-write`, and `skipGitRepoCheck=true`.
- The profile was enabled only for explicit selection and was not made default.

## Evidence

Profile validation on `67`:

- `Codex app-server initialize handshake succeeded (codex)`.
- Runtime profile option keys included `codexHome`.

Direct provider probes from the `agent` container:

- `/v1/models` returned the Qwen model.
- `/v1/responses` returned `OK`.
- `/v1/chat/completions` returned `OK`.

Manual app-server probe with isolated `CODEX_HOME`:

- `thread/start` succeeded.
- Thread used `modelProvider: qwen_llamacpp_8003`.
- `turn/start` failed with provider payload:

```json
{
  "error": {
    "code": 400,
    "message": "'type' of tool must be 'function'",
    "type": "invalid_request_error"
  }
}
```

Final deployed canary evidence:

- Task `10b86f63-e9fb-4fd6-ad78-dfcb0f5cd0c5` status: `blocked_external`.
- Task was paused to avoid background retries.
- Agent log contained `category="transport"` and `diagnosticsReason="'type' of tool must be 'function'"`.
- `/home/www/botIntevra/audit/test-agent-runtime.md` did not exist.
- `/home/www/botIntevra` git status was clean on branch `feature/full-project-audit-across-all-available-d2c6d0`.

## Verification

```text
npm.cmd run test --workspace=@aif/runtime -- src/adapters/codex/appServer/__tests__/eventMapper.test.ts src/adapters/codex/appServer/__tests__/run.test.ts src/adapters/codex/appServer/__tests__/process.test.ts src/__tests__/codexModelDiscoveryProcess.test.ts src/__tests__/codexErrors.test.ts
```

Result: 5 test files passed, 60 tests passed.

```text
npm.cmd run build --workspace=@aif/runtime
```

Result: passed.

Remote:

- `docker compose --project-directory /opt/aif-handoff build api agent`: passed.
- `docker compose --project-directory /opt/aif-handoff up -d api agent`: passed.
- `docker compose --project-directory /opt/aif-handoff ps api agent`: both services running.

## Gate Status

- Plan review: `PLAN PASS`.
- Test gate: `TEST PASS`.
- Final review gate: `REVIEW PASS`.
- Memory sync: `MODE=auto` completed local review artifacts and skipped publish because there were no publishable curated documents.

## Memory Sync

- Report: `docs/memory/reports/work-20260509-qwen-local-agent-runtime-canary-memsync-report.md`
- Status: `skipped`
- Reason: `no publishable curated documents`

## Conclusion

The current raw Qwen endpoint is healthy for inference but is not compatible with Codex app-server's agent tool schema. More tuning of the canary profile will not make this endpoint an AIF agent runtime.

The next task should implement a dedicated `qwen-local-agent` runtime adapter on `67` with an in-process AIF tool loop, function-style tools compatible with llama.cpp, allowlisted repo operations inside the project root, structured tool logs, and no changes to raw `8003`/`8004` inference services.
