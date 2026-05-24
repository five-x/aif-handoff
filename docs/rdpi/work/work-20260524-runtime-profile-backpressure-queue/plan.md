# Plan

## Scope

In scope:

- qwen-local-agent runtime adapter queue/cancel/logging behavior.
- coordinator runtime profile attribution and audit `8005` routing.
- targeted tests and runtime documentation.

Out of scope:

- changing the actual `192.168.88.62` model server configuration;
- local service/e2e/browser checks;
- database schema expansion for request lifecycle logs;
- altering unrelated dirty-tree changes.

## Steps

1. Add qwen-local-agent request queue policy.
   - Introduce bounded endpoint queue options with conservative defaults.
   - Enforce concurrency 1 for protected endpoint keys.
   - Fail queued requests before fetch when the queue is full or queue timeout expires.
   - Mark queue-local failures with structured statuses such as `endpoint_queue_timeout` and `endpoint_queue_full`.
   - Ensure queue-local failures do not open endpoint circuit/cooldown.

2. Add explicit request cancellation.
   - Replace implicit fetch timeout-only behavior with an adapter-owned request abort controller.
   - Bridge external abort and run timeout into the request controller.
   - Ensure timeout/cancel errors carry structured `providerMeta` with attempted `profileId`, `baseUrl`, `model`, endpoint key, duration/wait, and status.
   - Treat local/client cancel separately from backend timeout; local cancel must not trip endpoint circuit/cooldown.

3. Add lifecycle logging.
   - Log queue wait/start/end/cancel with the required fields.
   - Keep existing request-estimate logs but do not rely on them as the only request lifecycle surface.

4. Fix failed-profile accounting.
   - Add helper(s) in coordinator to read attempted profile id from `RuntimeExecutionError.providerMeta`.
   - Use that id in transient timeout/fallback and audit timeout recovery paths before recomputing current/fallback profile.
   - Add regression tests for usage/recovery mismatch.

5. Route long audit tasks to `8005`.
   - Add a protected-endpoint selection helper for audit stage: if selected profile is `8003`, find compatible enabled `8005` qwen-local-agent profile visible to the task.
   - Apply before runtime gate/semaphore acquisition.
   - Record an activity entry when rerouting happens.

6. Update docs.
   - Document protected endpoint queue settings and lifecycle logs.
   - State that service/e2e validation for this repo targets `192.168.88.67`; do not run local service testing.

7. Verify.
   - Run targeted runtime adapter tests for qwen-local-agent.
   - Run targeted coordinator tests for runtime profile routing/accounting.
   - Run build if targeted tests pass.
   - Do not run local dev servers or localhost browser/e2e checks.

## Acceptance criteria

- Concurrent protected endpoint requests inside one AIF agent/runtime process do not enter `/chat/completions` simultaneously.
- A request can fail with a bounded pre-runtime queue timeout without calling fetch.
- Queue timeout, queue full, and local cancel do not trip endpoint circuit/cooldown.
- In-flight timeout/cancel aborts the fetch request.
- Logs expose request lifecycle metadata with `taskId`, `profileId`, `baseUrl`, `model`, `durationMs`, `timeoutMs`, and HTTP/error.
- Recovery/activity failed profile id matches the attempted runtime profile id from the failed request.
- Audit implementation that would use protected `8003` reroutes to compatible enabled `8005` when available.
- Tests cover the new queue, cancel, profile-accounting, and audit-routing behavior.
- Residual risk is documented: process-local semaphore/queue does not coordinate multiple independent AIF processes.

## Evidence plan

- `npm.cmd test --workspace=@aif/runtime -- qwenLocalAgent`
- `npm.cmd test --workspace=@aif/agent -- coordinator`
- `npm.cmd run build`
- `python "$env:USERPROFILE\.codex\tools\codex-flow-audit.py" --repo .`
