# Plan - Implement Qwen Local Agent Runtime

Task ID: `work-20260509-implement-qwen-local-agent-runtime`
Lane: `work`
Date: 2026-05-09

## Scope

Implement one narrow, explicit `qwen-local-agent` runtime path in `@aif/runtime`, document profile usage, and verify with unit/build checks plus live Bot Intevra canary evidence.

Out of scope:

- replacing or changing `codex`, `claude`, `opencode`, or raw API profile behavior
- modifying raw inference services on `62`
- making Qwen local agent a default runtime
- broad autonomous shell permissions beyond the first allowlist

## Implementation Steps

1. Add the `qwenLocalAgent` adapter files with descriptor, error classifier, API chat-completions tool loop, model listing/connection validation, and AIF-controlled tool executor.
2. Register the adapter in `bootstrapRuntimeRegistry()` and export only adapter option/logger types from the package root.
3. Update runtime profile resolution so `qwen-local-agent` infers `api` as the default transport and Qwen env vars are recognized.
4. Add focused tests for registration, transport resolution, function-style schema, tool loop behavior, path safety, shell constraints, redaction, timeout behavior, usage, validation, and model listing.
5. Update timeout coverage for the new HTTP adapter file.
6. Update `docs/providers.md` with profile example, constraints, canary instructions, and safety notes.
7. Run required local verification:
   - `npm.cmd run test --workspace=@aif/runtime -- src/__tests__/qwenLocalAgent.test.ts src/__tests__/bootstrap.test.ts src/__tests__/timeoutCoverage.test.ts src/__tests__/resolution.test.ts`
   - `npm.cmd run test --workspace=@aif/runtime -- src/adapters/codex/appServer/__tests__/eventMapper.test.ts src/adapters/codex/appServer/__tests__/process.test.ts src/__tests__/codexModelDiscoveryProcess.test.ts src/__tests__/codexErrors.test.ts`
   - `npm.cmd run build --workspace=@aif/runtime`
   - `npm.cmd run lint --workspace=@aif/runtime`
8. Deploy to `67`, rebuild/restart `api` and `agent`, and verify service health.
9. Run live acceptance canary in Bot Intevra and verify the canary commit.
10. Run `$memsync MODE=auto`.
11. After independent `TEST PASS` and `REVIEW PASS`, update only the matching intake status entry to `done`.

## Gates

- Independent plan review required `PLAN PASS` before implementation.
- Independent final tester required `TEST PASS`.
- Independent final reviewer required `REVIEW PASS`.
