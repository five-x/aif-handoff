[← Configuration](configuration.md) · [Back to README](../README.md)

# Providers

This guide describes the runtime/provider model introduced by `@aif/runtime`.

## Runtime Architecture

`@aif/runtime` is the shared execution layer for both API and agent packages:

- runtime registry (`RuntimeRegistry`) for built-in and module-loaded adapters
- workflow-spec abstraction (`RuntimeWorkflowSpec`) so orchestrators stay provider-neutral
- runtime-profile resolution (`resolveRuntimeProfile`) with capability checks and redaction helpers
- adapter surfaces for run/resume/session/model-discovery operations

## Runtime Profile Model

Runtime profiles are persisted in `runtime_profiles` and reference only non-secret configuration.

| Field                   | Purpose                                                    |
| ----------------------- | ---------------------------------------------------------- |
| `projectId`             | Scope profile to one project, or `null` for global profile |
| `name`                  | Display name shown in UI                                   |
| `runtimeId`             | Adapter id (for example `claude`, `codex`)                 |
| `providerId`            | Provider namespace (for example `anthropic`, `openai`)     |
| `transport`             | Adapter transport (`sdk`, `cli`, `api`)                    |
| `baseUrl`               | Optional custom endpoint                                   |
| `apiKeyEnvVar`          | Env var name containing API key                            |
| `defaultModel`          | Optional default model alias/id                            |
| `headers`               | Optional non-secret header map                             |
| `options`               | Adapter-specific options object                            |
| `enabled`               | Toggle profile availability without deleting it            |
| `runtimeLimitSnapshot`  | Latest persisted normalized limit state for this profile   |
| `runtimeLimitUpdatedAt` | ISO timestamp of the last persisted limit-state write      |

Secrets are never written to SQLite. Use environment variables or temporary validation payloads.

## Effective Profile Resolution

Task mode fallback order:

1. `tasks.runtime_profile_id`
2. `projects.default_task_runtime_profile_id`
3. `app_settings.default_task_runtime_profile_id`
4. environment fallback

Planning and review use the same chain, but `default_plan_runtime_profile_id` / `default_review_runtime_profile_id` fall back to the task default at the same scope when unset. Chat uses `default_chat_runtime_profile_id` for the project/app steps.

Canonical runtime stages are accepted by the data layer and mapped onto compatibility slots:

| Stage                               | Compatibility slot |
| ----------------------------------- | ------------------ |
| `planner`, `plan_checker`           | `plan`             |
| `implementer`, `audit`, `synthesis` | `task`             |
| `reviewer`, `security`              | `review`           |
| `chat`                              | `chat`             |

Warmup persistence uses the canonical runtime stage, not just the compatibility
slot. `runtime_warmup_sessions.stage` keeps planner, implementer, reviewer,
security, audit, and synthesis seeds separate even when several stages resolve
to the same profile/runtime/model tuple.

Scope rules:

- app defaults may point only to enabled global profiles (`runtime_profiles.project_id = null`)
- project defaults and task/chat overrides may point to either a same-project profile or a global profile
- project-owned profiles from another project are rejected at the API layer

Usage events are append-only. Successful provider usage records `outcome=success`. Completed calls with no provider usage record `outcome=missing_usage` with zero tokens/cost. Adapter failures record `outcome=failed` with zero tokens/cost and an optional `error_category`. Zero-usage outcome rows do not change aggregate token or cost math.

Project stage budgets use the existing fields only: planner, plan checker, implementer, and review sidecar. Stages warn at 80% and block at 100%. Reviewer/security share review sidecar budget; audit/synthesis share implementer budget in this compatibility slice. A block can be manually overridden only with `task.runtimeOptions.runtimeBudgetOverride.justification` set to a non-empty string. Monthly, task-wide, and chat budget schemas/UI are not implemented here.

Runtime-limit blocking remains explicit: `blocked_external` tasks with `retryAfter` are parked until the watchdog release cycle reaches that timestamp, then the original status is restored and the stored task limit snapshot is cleared before normal processing resumes.

The API exposes effective selection endpoints:

- `GET /runtime-profiles/effective/task/:taskId`
- `GET /runtime-profiles/effective/chat/:projectId`

## Supported Runtimes

| Runtime            | Provider     | Transports                | Resume                   | Session Fork     | Sessions             | Agent Defs    | Usage Reporting                          | Light Model         | Status                          |
| ------------------ | ------------ | ------------------------- | ------------------------ | ---------------- | -------------------- | ------------- | ---------------------------------------- | ------------------- | ------------------------------- |
| `claude`           | `anthropic`  | SDK, CLI, API             | Yes (SDK/CLI)            | Yes (SDK/CLI)    | Yes (SDK/CLI)        | Yes (SDK/CLI) | `FULL` (all transports)                  | `claude-haiku-3-5`  | Built-in                        |
| `codex`            | `openai`     | SDK, CLI, App Server, API | Yes (SDK/CLI/App Server) | Yes (App Server) | Yes (SDK/App Server) | No            | `FULL` SDK/API, `PARTIAL` CLI/App Server | default             | Built-in                        |
| `opencode`         | `opencode`   | API                       | Yes                      | No               | Yes                  | No            | `NONE`                                   | null (configurable) | Built-in                        |
| `openrouter`       | `openrouter` | API                       | No                       | No               | No                   | No            | `FULL`                                   | null (configurable) | Built-in                        |
| `qwen-local-agent` | `qwen`       | API                       | No                       | No               | No                   | No            | `PARTIAL`                                | null (configurable) | Built-in, explicit profile only |
| Custom             | Any          | Any                       | Configurable             | Configurable     | Configurable         | Configurable  | Must declare                             | Configurable        | Via `AIF_RUNTIME_MODULES`       |

Capabilities are **transport-aware**: the same adapter may expose different capabilities depending on the selected transport. For example, Codex supports resume on SDK/CLI/App Server, session fork only on App Server, and session discovery on SDK/App Server. Use `resolveAdapterCapabilities(adapter, transport)` to get the effective set.

### Runtime-limit observability

Runtime-limit auto-pause depends on what each provider/transport can actually surface. The runtime layer normalizes these inputs into the shared `runtimeLimitSnapshot` contract and marks each snapshot as either `exact` or `heuristic`.

| Runtime / transport          | Limit source                            | Precision   | Notes                                                                                                                                                                                                         |
| ---------------------------- | --------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude SDK / CLI             | Claude `rate_limit_event`               | `heuristic` | Structured qualitative status with reset timestamps (`status`, `resetsAt`, `overageStatus`, `isUsingOverage`, ...)                                                                                            |
| Claude API                   | Anthropic rate-limit headers            | `exact`     | Exact request/token limits and reset times from `anthropic-ratelimit-*` + `retry-after`                                                                                                                       |
| Codex API                    | OpenAI-compatible rate-limit headers    | `exact`     | Exact request/token limits and reset times from `x-ratelimit-*` + `retry-after`                                                                                                                               |
| Codex SDK / CLI / App Server | Codex session `token_count.rate_limits` | `exact`     | API background indexing tails persisted Codex session logs into SQLite (`codex_limit_heads`/`codex_limit_history`); `/runtime-profiles` overlays read from that index instead of per-request filesystem scans |
| OpenRouter API               | OpenAI-compatible rate-limit headers    | `exact`     | Uses `x-ratelimit-*` / `retry-after` when the upstream provides them                                                                                                                                          |
| OpenCode API                 | structured error metadata               | `heuristic` | Preserves `resetAt` / retry hints on rate-limit errors, but no proactive normalized snapshot is emitted today                                                                                                 |
| Qwen Local Agent API         | none                                    | none        | The first implementation records token usage only when the llama.cpp-compatible response includes usage fields                                                                                                |

Auto-pause semantics follow the precision:

- `exact` snapshots can proactively gate new work when the remaining quota has already crossed the configured safety threshold.
- `heuristic` snapshots only proactively gate when the provider reports the runtime as blocked.
- When a provider exposes `resetAt` / `retryAfterSeconds`, the agent uses those values instead of random quota backoff.

### Provider metadata sanitization

Runtime-limit `providerMeta` is sanitized before it is persisted or exposed outside the runtime layer.

- Only provider-specific allow-listed top-level keys survive sanitization.
- String values are redacted before storage.
- Nested structured objects stay typed only when the key is registered in `PROVIDER_META_NESTED_SCHEMAS` (currently `modelUsageSummary` and `toolUsageSummary`).
- Any new allow-listed key that emits a nested object/array must add a schema entry, otherwise that nested container is collapsed to a redacted opaque JSON string.

Redaction helpers have distinct contracts:

- `redactProviderText()` is the strict client-safe helper. Use it for anything returned to clients or persisted in user-visible payloads.
- `redactProviderTextForLogs()` is the server-log helper. It still scrubs secrets, but preserves URLs and emails so diagnostics remain useful.

For Claude-family profiles, the runtime now distinguishes the backend by resolved endpoint identity, not just `runtimeId/providerId/model`:

- Native Anthropic uses SDK `rate_limit_event` (SDK/CLI) or Anthropic headers (API).
- Z.AI / GLM Coding Plan is detected from Anthropic-compatible endpoints such as `https://api.z.ai/api/anthropic` and refreshes quota from the provider monitor endpoints when headers are insufficient:
  - `/api/monitor/usage/quota/limit` for live quota windows
  - `/api/monitor/usage/model-usage` for recent model/token usage summaries
  - `/api/monitor/usage/tool-usage` for recent MCP/tool usage summaries
- Alibaba Coding Plan Anthropic-compatible endpoints are tracked as a separate family, but remain `partial` for quota visibility because no official provider-side polling API is integrated yet.
- Other Anthropic-compatible endpoints fall back to headers for API transport and SDK events for SDK/CLI transport when available.

UI grouping for Claude runtime usage should use the normalized backend family plus the server-side account fingerprint (derived from endpoint origin + resolved auth secret), so native Anthropic, Z.AI GLM, and other compatible backends do not collapse into one card.

### Usage reporting contract

Every adapter must declare a `usageReporting` value in its `RuntimeCapabilities`. The registry wrapper reads this field for every run and enforces the contract — a new adapter cannot silently skip token accounting:

- **`FULL`** — adapter always populates `RuntimeRunResult.usage` on a successful run. If the wrapper observes a null `usage` while the capability says `FULL`, it logs an error (dev) or fires a metric (prod). The contract test in `bootstrap.test.ts` also fails the build if the field is missing.
- **`PARTIAL`** — adapter returns usage when the provider gives it, but may return `null` on some transport/streaming paths (e.g. CLI early-termination). The wrapper accepts both and records only the non-null events.
- **`NONE`** — transport fundamentally cannot report token counts (e.g. OpenCode message payload). The wrapper warns if usage unexpectedly appears, but this is an opt-out from the usage pipeline — dashboards will show zero traffic for runtimes in this tier.

All successful runs that produce non-null usage flow through the registry's `usageSink`, which persists them to the `usage_events` table and rolls them up into per-task / per-project / per-chat-session aggregates. Sink wiring lives in `packages/api/src/services/runtime.ts` (API) and `packages/agent/src/index.ts` / `subagentQuery.ts` (agent) — both use `createDbUsageSink()` from `@aif/data`.

### Interactive questions capability

Optional `supportsInteractiveQuestions` flag in `RuntimeCapabilities` declares that the adapter emits runtime-neutral `tool:question` events (e.g. Claude's `AskUserQuestion`). Consumers — notably the chat route — use this flag to gate provider-specific prompt scaffolding (`CHAT_ASKUSERQUESTION_HINT` is only injected into `systemPromptAppend` when the resolved adapter declares the capability). Claude (SDK + CLI) sets the flag; Claude API, Codex, OpenCode, and OpenRouter leave it unset (defaults to `false`). Adapters that add interactive tool parsing must also call `buildToolUseEvents()` with a `questionPayload` so the rendered shape stays identical across runtimes.

### Transport Types

| Transport    | Description                                           | Example                                  |
| ------------ | ----------------------------------------------------- | ---------------------------------------- |
| `sdk`        | In-process library call via JS/TS SDK                 | Claude Agent SDK, Codex SDK              |
| `cli`        | Spawn a subprocess, parse stdout                      | `claude --agent ...`, `codex run --json` |
| `app-server` | Spawn `codex app-server` and exchange stdio JSONL RPC | Codex App Server transport               |
| `api`        | HTTP POST to a remote endpoint                        | OpenAI-compatible REST API               |

#### Transport Observability Differences

**SDK transport** streams events in real time — tool calls, subagent spawns, and partial messages are visible as they happen. The Agent Activity timeline shows each tool invocation with timestamps. The first-activity watchdog can detect hung agents within 60 seconds.

**CLI and API transports** are opaque — the entire tool-calling cycle runs inside the subprocess or remote server. The coordinator only sees "agent started" and "agent complete/failed" with no intermediate events. Consequently:

- **Agent Activity** shows only start/complete entries, not individual tool calls
- **First-activity watchdog** is disabled (no `onToolUse` callbacks to monitor)
- **Start timeout** (`AGENT_QUERY_START_TIMEOUT_MS`) is disabled — CLI/API produce output only after the full run completes, so the only protection is the run timeout (`AGENT_STAGE_RUN_TIMEOUT_MS`)
- **Token usage** is reported as a single aggregate at the end of the run

**Codex App Server transport** streams JSONL notifications from the subprocess, so it behaves closer to SDK from an observability perspective (streaming events, resumable thread IDs) while still using a local process execution model.

## Built-In Adapter Examples

### Claude (SDK)

```json
{
  "projectId": "PROJECT_UUID",
  "name": "Claude Sonnet",
  "runtimeId": "claude",
  "providerId": "anthropic",
  "transport": "sdk",
  "apiKeyEnvVar": "ANTHROPIC_API_KEY",
  "defaultModel": "sonnet",
  "enabled": true
}
```

Optional proxy mode:

- set `ANTHROPIC_BASE_URL`
- set one of `ANTHROPIC_API_KEY` or `ANTHROPIC_AUTH_TOKEN`
- if proxy requires explicit model, set `ANTHROPIC_MODEL` (or profile `defaultModel`)
- if proxy handles model routing, keep `defaultModel` empty

### Claude (CLI)

Spawns `claude` binary as a subprocess. Supports `--agent` flag for agent definitions and `--resume` for session continuation. Auth is handled by the CLI's own login (`claude /login`).

```json
{
  "projectId": null,
  "name": "Claude CLI",
  "runtimeId": "claude",
  "providerId": "anthropic",
  "transport": "cli",
  "defaultModel": "claude-sonnet-4-5",
  "enabled": true
}
```

CLI-specific options:

- `claudeCliPath` — override for the `claude` binary path (default: auto-discovered)
- `CLAUDE_CLI_PATH` env var — same, via environment

### Codex (SDK transport)

Uses `@openai/codex-sdk` which wraps the Codex CLI with thread-based conversations, streaming events, and resume support. Auth is handled by the CLI's own login (`codex auth login`), same as Claude SDK.

```json
{
  "projectId": null,
  "name": "Codex SDK",
  "runtimeId": "codex",
  "providerId": "openai",
  "transport": "sdk",
  "defaultModel": "gpt-5.4",
  "enabled": true
}
```

SDK-specific options:

- `codexCliPath` — path to the `codex` binary (SDK wraps the CLI)
- `codexConfig` — JSON object of CLI config overrides (flattened to `--config` flags)
- `sandboxMode` — one of `read-only`, `workspace-write`, `danger-full-access`
- `approvalPolicy` — one of `untrusted`, `on-failure`, `on-request`, `never`
- `modelReasoningEffort` — one of `minimal`, `low`, `medium`, `high`, `xhigh`
- `skipGitRepoCheck` — bypass the Codex guard that refuses to run outside a git repo (SDK, App Server, and CLI)

Invalid `options.approvalPolicy` / `options.sandboxMode` values are ignored with a runtime warning, and the adapter falls back to the effective default for that execution path.

### Codex (CLI transport)

```json
{
  "projectId": null,
  "name": "Codex CLI",
  "runtimeId": "codex",
  "providerId": "openai",
  "transport": "cli",
  "apiKeyEnvVar": "OPENAI_API_KEY",
  "defaultModel": "gpt-5.4",
  "options": {
    "approvalPolicy": "on-failure"
  },
  "enabled": true
}
```

**`codexCliArgs` is a full escape hatch.** When `options.codexCliArgs` is set, the adapter uses the custom template verbatim (with `{prompt}`, `{model}`, `{session_id}` substitutions) and **skips all adapter-managed flags** — including `--model`, `-c model_reasoning_effort`, `-c approval_policy`, `-c sandbox_mode`, `--skip-git-repo-check`, and the bypass-permission translation. If you use a custom template you are responsible for emitting these flags yourself. Profile-level `options.approvalPolicy`, `options.sandboxMode`, `options.skipGitRepoCheck`, `options.modelReasoningEffort`, and `AGENT_BYPASS_PERMISSIONS` all have **no effect** when a custom template is active. Use this only for integration with non-standard CLI wrappers.

### Codex (App Server transport)

Runs `codex app-server` over stdio JSONL RPC and keeps Codex thread IDs as resumable runtime session IDs.

```json
{
  "projectId": null,
  "name": "Codex App Server",
  "runtimeId": "codex",
  "providerId": "openai",
  "transport": "app-server",
  "defaultModel": "gpt-5.4",
  "options": {
    "approvalPolicy": "on-request",
    "sandboxMode": "workspace-write"
  },
  "enabled": true
}
```

App Server operational notes:

- Reuses the same key options as other Codex transports: `codexCliPath`, `approvalPolicy`, `sandboxMode`, `modelReasoningEffort`, and `skipGitRepoCheck`.
- Does not add a transport-local hard run timeout. Long-running stages are governed by the shared runtime execution config; `options.appServerRequestTimeoutMs` only controls individual JSONL RPC request waits.
- Human approval bridging is not implemented yet. App Server approval requests, including command, file-change, permissions, apply-patch, and exec-command requests, are denied by design and surfaced as permission failures/events; App Server therefore reports `supportsApprovals: false` even though approval request events are observable. Unattended App Server profiles should use `approvalPolicy="never"` only when the caller has intentionally accepted that trust level.
- Session list APIs are supported through `thread/list` and `thread/read`; AIF stores Codex thread IDs as runtime session IDs for resume.
- Docker images already include `@openai/codex` and mount persistent `~/.codex` auth state (`codex-auth` volume), so no extra Docker wiring is required for this transport.
- On Windows, configured `codexCliPath` / `CODEX_CLI_PATH` values are treated as executable paths or shim names, not shell snippets. Values containing command-shell metacharacters are rejected before spawn.

### Codex (API transport)

```json
{
  "projectId": "PROJECT_UUID",
  "name": "Codex API",
  "runtimeId": "codex",
  "providerId": "openai",
  "transport": "api",
  "baseUrl": "http://localhost:8080",
  "apiKeyEnvVar": "OPENAI_API_KEY",
  "enabled": true
}
```

### Codex OAuth login in Docker (broker)

`codex login --device-auth` (codex-cli v0.124.0+) prints a fixed verification
URL plus a one-time code. The user opens the URL in the host browser, enters
the code, completes ChatGPT sign-in — the CLI exits 0 and writes
`~/.codex/auth.json` inside the container. No loopback callback, no port
binding, no host bridging.

The agent ships a small HTTP broker (`packages/agent/src/codex/loginBroker.ts`)
that wraps this flow when `AIF_ENABLE_CODEX_LOGIN_PROXY=true`:

```
[API /auth/codex/login/*]
  ▼ proxies over docker network
[Agent :3010 broker]
  ├─ start  → spawn `codex login --device-auth`,
  │           parse stdout for verification URL + code,
  │           expose them on /status
  ├─ status → { active, sessionId, verificationUrl, userCode, startedAt }
  └─ cancel → SIGTERM child
```

The CLI exits naturally when the user finishes the browser flow; the broker
clears the active session on the child `exit` event and `/status` flips to
`{ active: false }`. The web UI polls `/status` to detect completion.

**Endpoints** (api-side, all behind the feature flag):

| Method | Path                       | Purpose                                                         |
| ------ | -------------------------- | --------------------------------------------------------------- |
| GET    | `/auth/codex/capabilities` | Always mounted. Returns `{loginProxyEnabled}`.                  |
| POST   | `/auth/codex/login/start`  | Spawn the CLI, return `{verificationUrl, userCode, ...}`.       |
| POST   | `/auth/codex/login/cancel` | SIGTERM the active child process.                               |
| GET    | `/auth/codex/login/status` | Poll for active/inactive + the current code + verification URL. |

**Security:**

- One-shot session: repeat `start` without `cancel`/success → `409 session_already_active`.
- Broker binds `0.0.0.0:3010` but is **not** port-mapped to the host in compose; only services on the same docker network can reach it.
- Logs mask all but the last 2 characters of the one-time code (`maskUserCode`).
- No user-supplied URL is ever forwarded — there is no callback endpoint to abuse.

**Environment variables:**

| Variable                       | Default             | Purpose                                          |
| ------------------------------ | ------------------- | ------------------------------------------------ |
| `AIF_ENABLE_CODEX_LOGIN_PROXY` | `false`             | Enable broker + `/auth/codex/*` routes.          |
| `AIF_CODEX_LOGIN_BROKER_PORT`  | `3010`              | Port the broker listens on inside the container. |
| `AGENT_INTERNAL_URL`           | `http://agent:3010` | Base URL the api uses to reach the broker.       |

**Production guidance:** the broker is a dev-only convenience. In production,
set `AIF_ENABLE_CODEX_LOGIN_PROXY=false` (the default in `docker-compose.production.yml`)
and provision `OPENAI_API_KEY` via `.env` instead.

### Bypass semantics (AGENT_BYPASS_PERMISSIONS)

When `AGENT_BYPASS_PERMISSIONS=1` is set in the environment, the runtime layer flips `execution.bypassPermissions=true`. This is intended for trusted, externally sandboxed environments (Docker containers) where the agent should run unattended.

Runtime calls also carry `execution.permissionPolicy`, a provider-neutral policy derived from task intent. The policy names the default mode (`workspace_write`, `read_only`, `review_only`, `audit_diagnostic_only`, or `danger_full_access`), file boundary, shell/network rules, and bypass audit requirements. Adapters should treat dangerous shell commands as requiring human approval and must fail closed when no approval bridge exists.

Each adapter translates this to its native "trust me, just run" mechanism:

| Runtime / transport | Bypass translation                                                                                          |
| ------------------- | ----------------------------------------------------------------------------------------------------------- |
| Claude SDK          | `permissionMode="bypassPermissions"` + `allowDangerouslySkipPermissions=true`                               |
| Claude CLI          | `--dangerously-skip-permissions`                                                                            |
| Codex SDK           | `approvalPolicy="never"` + `sandboxMode="danger-full-access"` (ThreadOptions)                               |
| Codex App Server    | `approvalPolicy="never"` + `sandboxMode="danger-full-access"` (thread metadata + interrupt-aware turn flow) |
| Codex CLI           | `-c approval_policy="never" -c sandbox_mode="danger-full-access"`                                           |

Why Codex disables both approval prompts **and** the sandbox: Codex has two orthogonal safety rails (approval policy + OS-level sandbox), while Claude has only one (permission prompts). To match Claude's effective "agent can do anything" behavior, both rails must be cleared. Leaving the Codex sandbox at its default `workspace-write` blocks network access — so `npm install`, `curl`, `git push`, and WebFetch would silently fail.

The Codex CLI uses `--config` (`-c`) overrides instead of the single `--dangerously-bypass-approvals-and-sandbox` flag because the same code path must work for both `codex exec` and `codex exec resume` — the resume subcommand rejects the standalone `--sandbox` flag, while `--config` overrides are accepted on both. The end-state is identical to the atomic flag.

**Opting out for Codex:** if you want narrower safety even in bypass mode, set `options.sandboxMode` or `options.approvalPolicy` explicitly in your profile — explicit profile values override the bypass defaults on SDK, App Server, and CLI transports:

```json
{
  "runtimeId": "codex",
  "transport": "cli",
  "options": {
    "sandboxMode": "workspace-write",
    "approvalPolicy": "never"
  }
}
```

With the example above, even when `AGENT_BYPASS_PERMISSIONS=1` is set, the agent runs with `approval_policy=never` (from the explicit option, which happens to coincide with the bypass default) and `sandbox_mode=workspace-write` (overrides the `danger-full-access` bypass default). You can mix and match — only the axis you set gets overridden.

When bypass is active for a task-scoped run, the coordinator records `[permission-policy:bypass]` in the task activity log with the selected intent and default mode. If the selected intent disallows bypass, such as `audit`, the runtime clears native provider bypass and records `[permission-policy:bypass-blocked]`.

### OpenRouter (API)

OpenRouter is a unified API proxy providing access to 200+ models from multiple providers (Anthropic, OpenAI, Google, Meta, etc.) through a single OpenAI-compatible endpoint.

```json
{
  "projectId": "PROJECT_UUID",
  "name": "OpenRouter",
  "runtimeId": "openrouter",
  "providerId": "openrouter",
  "transport": "api",
  "apiKeyEnvVar": "OPENROUTER_API_KEY",
  "defaultModel": "anthropic/claude-sonnet-4",
  "enabled": true
}
```

OpenRouter-specific options:

- `httpReferer` — URL of your app, used for OpenRouter rankings and rate limit priority
- `appTitle` — app name shown in OpenRouter dashboard (defaults to `AIF Handoff`)
- `baseUrl` — custom endpoint (defaults to `https://openrouter.ai/api/v1`)

Environment variables:

- `OPENROUTER_API_KEY` — API key from [openrouter.ai/keys](https://openrouter.ai/keys)
- `OPENROUTER_BASE_URL` — custom endpoint (for self-hosted proxies)
- `OPENROUTER_MODEL` — default model when profile `defaultModel` is not set
- `OPENROUTER_HTTP_REFERER` — recommended referer header for rankings
- `OPENROUTER_APP_TITLE` — recommended app title header for rankings

Model IDs use the `provider/model` format (e.g. `anthropic/claude-sonnet-4`, `openai/gpt-4o`, `google/gemini-2.0-flash-001`). Some models are available for free (suffixed with `:free`).

### Qwen Local Agent (API)

`qwen-local-agent` is a dedicated AIF-controlled tool loop for local Qwen llama.cpp endpoints that accept OpenAI-compatible chat completions with function-style tools. Use it when a local endpoint rejects Codex App Server's Responses tool schema with errors such as `'type' of tool must be 'function'`.

```json
{
  "projectId": "PROJECT_UUID",
  "name": "Qwen Local Agent Canary",
  "runtimeId": "qwen-local-agent",
  "providerId": "qwen",
  "transport": "api",
  "baseUrl": "http://protected-qwen-endpoint:8003/v1",
  "apiKeyEnvVar": "QWEN_API_KEY",
  "defaultModel": "Qwen3-32B-Q4_K_M.gguf",
  "options": {
    "toolTimeoutMs": 30000,
    "maxToolTurns": 12,
    "maxOutputChars": 12000,
    "endpointQueueLimit": 1,
    "endpointQueueTimeoutMs": 30000,
    "timeoutMs": 120000
  },
  "enabled": true
}
```

Operational notes:

- Keep first profiles explicit and project-scoped. Do not make this runtime a system or project default until a canary proves real file, shell, git, and commit execution in the target project.
- `transport` should be set to `api` in profiles for readability. Runtime resolution also defaults `qwen-local-agent` to API.
- `baseUrl` may come from the profile or `QWEN_BASE_URL`.
- `defaultModel` may come from the profile or `QWEN_MODEL`.
- `QWEN_API_KEY` is optional for protected local deployments that authenticate at the network layer. If it is present, the adapter sends it as a bearer token.
- The adapter owns the repository tool loop. It does not start Codex App Server, does not use Codex Responses tools, and does not modify raw inference endpoints.
- Protected llama.cpp endpoints on ports `8003` and `8005` are treated as single-slot endpoints inside each AIF process. AIF serializes in-flight requests for those endpoint/profile selections, applies a bounded pre-runtime queue, and times out queue waits before sending HTTP to the runtime.
- `endpointQueueLimit` controls how many requests may wait behind the active protected-endpoint request. Keep it at `1` for the current `8003` / `8005` single-slot deployment.
- `endpointQueueTimeoutMs` controls how long a queued request may wait before failing locally with `endpoint_queue_timeout`. Queue-full and queue-timeout outcomes are local backpressure outcomes and must not trip endpoint cooldown.
- Request lifecycle logs for this adapter include `taskId`, `profileId`, `baseUrl`, `model`, `durationMs`, `timeoutMs`, and HTTP/error status for start, end, cancel, timeout, queue-full, and queue-timeout events.
- Request timeout/cancel aborts the active fetch signal so llama.cpp can stop work for AIF requests that AIF has already abandoned.
- Long audit tasks should use a protected `8005` profile explicitly. If an audit stage resolves to a protected `8003` profile and a compatible enabled `8005` profile is visible, the coordinator records a one-shot audit-stage route to `8005`. Use `8003` only with hard context and output budgets.
- The concurrency guard is process-local. If multiple AIF agent/API processes can send to the same llama.cpp endpoint, deploy an external lease/proxy or run a single writer process for those profiles.

Safety model:

- All file paths are resolved inside `projectRoot`; absolute paths and `..` escapes are rejected.
- Secret-like paths such as `.env`, private keys, credential/token files, and common secret directories are denied for file and shell tools.
- VCS control paths such as `.git/**` are denied for file, patch, shell, and git staging tools.
- `run_shell` is a structured command tool, not an arbitrary shell string. It uses `spawn` with `shell: false`, a small command allowlist, cwd enforcement, timeout handling, sanitized child-process environment, and output redaction.
- Shell working directories are validated with the same no-symlink/no-junction real-path checks as file tools. `ls` accepts only safe flags; path arguments are intentionally rejected in favor of `list_files` or `cwd`.
- Generic interpreters and file-content commands are intentionally not exposed through `run_shell` in the first implementation. Use `read_file` for bounded file reads and `git_status` / `git_commit` for git actions.
- Package-manager script execution is intentionally not exposed through `run_shell`; editable project scripts can invoke interpreters and shell snippets, so local validation should use a separate trusted runtime path.
- File, patch, and git path handling rejects symlink/junction components and validates real paths under the real project root before reading, writing, patching, or staging files.
- `apply_patch` rejects Git-quoted patch paths, unquoted whitespace in patch paths, symlink file modes, and executable file modes.
- `git_commit` stages explicit validated files only and disables Git hooks for the commit operation.
- Tool calls, sanitized arguments, exit codes, touched files, and final results are emitted as runtime events and flow through existing task activity logging. Unknown tool arguments are dropped from event input, and retained argument values are recursively redacted before logging.

Canary guidance:

1. Create a project-scoped non-default profile for the target project.
2. Run explicit canary and audit-quality checks only against the remote AIF service at `http://192.168.88.67/` / `http://192.168.88.67/api`; do not start a local AIF service or use localhost e2e validation for this deployment.
3. Ask Qwen local agent to create `audit/test-agent-runtime.md`, inspect workspace state, run git status, and commit only that file.
4. Verify the resulting commit in the remote project workspace.
5. Verify existing raw inference services remain unchanged.

### OpenCode (API)

OpenCode integration uses the local or remote `opencode serve` HTTP server. This is the recommended mode for `@aif/runtime` because it provides session APIs and event streams through a stable OpenAPI surface.

```json
{
  "projectId": "PROJECT_UUID",
  "name": "OpenCode API",
  "runtimeId": "opencode",
  "providerId": "opencode",
  "transport": "api",
  "baseUrl": "http://127.0.0.1:4096",
  "defaultModel": "anthropic/claude-sonnet-4",
  "enabled": true
}
```

OpenCode-specific options:

- `baseUrl` — OpenCode server URL (defaults to `OPENCODE_BASE_URL` or `http://127.0.0.1:4096`)
- `serverUsername` — Basic auth username for protected servers (defaults to `opencode`)
- `serverPassword` — Basic auth password for protected servers (or set `OPENCODE_SERVER_PASSWORD`)
- `timeoutMs` — Request timeout override for OpenCode API calls

Environment variables:

- `OPENCODE_BASE_URL` — default OpenCode server URL for API transport
- `OPENCODE_SERVER_USERNAME` — default username for basic auth
- `OPENCODE_SERVER_PASSWORD` — password for basic auth protected servers
- `OPENCODE_PROVIDER_ID` — default provider ID when runtime profile model does not include `provider/model`

Quick start:

```bash
opencode serve --hostname 127.0.0.1 --port 4096
```

For Dockerized deployments, expose the OpenCode server and set profile `baseUrl` to the container/network address.

Permission handling:

- OpenCode permissions live in the server-side `opencode.json` config (per-agent `permission` map resolving to `"allow"` / `"ask"` / `"deny"`). The default `build` agent is effectively permissive (`"*": "allow"` with a few exceptions).
- When `AGENT_BYPASS_PERMISSIONS=true`, the adapter forces `agent: "build"` in the message body so a user-configured restrictive `default_agent` (e.g. `plan`) cannot block edits.
- Per-tool `"ask"` rules (e.g. reading `.env*`, writing outside the worktree) are still enforced server-side. If a session hits an `"ask"` rule, OpenCode emits a permission event over `/event` SSE that no-one answers, and the `/session/:id/message` POST will hang until `runTimeoutMs`. For full parity with Claude's `--dangerously-skip-permissions`, set `"permission": "allow"` in `opencode.json`.

## Capability Gates

Runtime descriptors declare capability flags:

- `supportsResume`
- `supportsSessionFork`
- `supportsSessionList`
- `supportsAgentDefinitions`
- `supportsStreaming`
- `supportsModelDiscovery`
- `supportsApprovals`
- `supportsCustomEndpoint`

`supportsSessionFork` gates adapters that can create a child session from a reusable source session. Warmup flows use this capability and must call the optional `forkSession()` method instead of resuming the source session directly. The capability is also behind the off-by-default `AIF_RUNTIME_SESSION_FORK_ENABLED=false` rollout flag; fork-capable transports expose `supportsSessionFork=true` only when that flag is enabled.

Additionally, `RuntimeExecutionIntent` supports `outputSchema` for structured JSON output (passed to adapters that support it, e.g. Codex SDK).

Workflows with unsupported requirements are rejected with normalized validation errors instead of raw adapter exceptions.

### Transport-Aware Capabilities

Adapters that support multiple transports may implement `getEffectiveCapabilities(transport)` to declare per-transport capability sets. The system uses `resolveAdapterCapabilities(adapter, transport)` to query the effective capabilities before checking workflow requirements.

## Runtime Profile API

Runtime profile management routes:

- `GET /runtime-profiles/runtimes`
- `GET /runtime-profiles`
- `POST /runtime-profiles`
- `PUT /runtime-profiles/:id`
- `DELETE /runtime-profiles/:id`
- `POST /runtime-profiles/validate`
- `POST /runtime-profiles/models`

Use `validate` before enabling new profiles, especially when using custom endpoints or transport-specific options.

## External Runtime Modules

Set `AIF_RUNTIME_MODULES` to a comma-separated list of module specifiers. Each module must export `registerRuntimeModule(registry)`.

Minimal module shape:

```ts
import { UsageReporting, type RuntimeAdapter } from "@aif/runtime";

const adapter: RuntimeAdapter = {
  descriptor: {
    id: "my-runtime",
    providerId: "my-provider",
    displayName: "My Runtime",
    capabilities: {
      supportsResume: false,
      supportsSessionFork: false,
      supportsSessionList: false,
      supportsAgentDefinitions: false,
      supportsStreaming: true,
      supportsModelDiscovery: true,
      supportsApprovals: false,
      supportsCustomEndpoint: true,
      usageReporting: UsageReporting.NONE,
    },
  },
  async run(input) {
    return { outputText: "ok", sessionId: null, usage: null };
  },
};

export function registerRuntimeModule(registry: {
  registerRuntime: (adapter: RuntimeAdapter) => void;
}) {
  registry.registerRuntime(adapter, { source: "module" });
}
```

Supported export forms:

- named export `registerRuntimeModule`
- default export function
- default export object containing `registerRuntimeModule`
