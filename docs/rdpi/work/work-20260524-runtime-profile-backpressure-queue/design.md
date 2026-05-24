# Design

## Target behavior

AIF should treat local Qwen endpoints on `192.168.88.62:8003` and `192.168.88.62:8005` as protected single-slot resources. Scheduler gating should prevent obvious parallel task starts inside one coordinator process, and the runtime adapter should still enforce a bounded per-endpoint request queue because retries, chat calls, and direct adapter invocations can bypass a single coordinator poll cycle.

This change provides a process-local guarantee inside one AIF agent/runtime process. It does not create a distributed lease across multiple AIF processes. If multiple AIF deployments can call `192.168.88.62` concurrently, an external/shared lease is still required as follow-up infrastructure.

## Runtime queue and cancel

- Keep endpoint keys derived from normalized `protocol://host:port`.
- For protected ports `8003` and `8005`, enforce:
  - concurrency: 1 active runtime request per endpoint key;
  - bounded waiting queue, configurable through adapter options and environment defaults;
  - queue timeout before calling `/chat/completions`;
  - local cancel propagation by using an explicit `AbortController` for each fetch and aborting it on runtime timeout, external abort, or queue cancellation.
- Distinguish queue timeout from provider request timeout in `RuntimeExecutionError.providerMeta.status` so recovery, task activity, and usage rows can reason about backpressure instead of treating every timeout as backend failure.
- Queue timeout should happen before `fetch()`. A queued request that times out must not touch llama-server.
- Queue-local statuses such as `endpoint_queue_timeout`, `endpoint_queue_full`, and client/local cancel must not open the endpoint circuit breaker or endpoint cooldown. Those states mean AIF backpressure or caller cancellation, not model-host transport failure.

## Request lifecycle logging

Add structured qwen-local-agent logs for:

- `request queued` / `request start`;
- `request end` with HTTP status and duration;
- `request cancel` when client/local abort occurs;
- `request timeout` when an in-flight provider request exceeds the runtime timeout;
- `request queue timeout` when it never reaches fetch.

Required safe fields:

- `taskId` from `input.usageContext.taskId`;
- `profileId`;
- `baseUrl`;
- `model`;
- `durationMs`;
- `timeoutMs`;
- `httpStatus` or `errorCategory` / safe error message;
- queue length or wait duration when applicable.

Do not log secrets, headers, raw prompts, raw provider bodies, or token-like values.

## Profile accounting

The runtime profile that actually built the `RuntimeRunInput` is the attempted profile. Failed usage already records `input.profileId`. Recovery/activity should use the same attempted profile where available instead of recomputing a stage default after the error.

Implementation approach:

- Attach attempted runtime metadata to qwen-local-agent timeout/backpressure errors in `providerMeta`, including `profileId`, `baseUrl`, `model`, and endpoint key.
- In coordinator recovery paths, prefer the profile id from the runtime error metadata for `failedProfileId`.
- Keep fallback selection separate from failed-profile attribution: selecting `8005` for retry must not rewrite the failed profile to `8005` if the timeout happened on `8003`.

## Long audit routing

Audit implementation is already mapped to runtime stage `audit`. The desired production routing is for `audit` stage defaults to point at `8005`. Code should not hardcode the live profile ids, but should provide deterministic fallback behavior:

- if the selected audit profile is a protected `8003` endpoint and a compatible enabled `8005` qwen-local-agent profile is visible for the project/global scope, select the `8005` profile for long audit implementation before starting the task;
- keep `8003` constrained by the existing hard input/output budgets;
- record an activity log entry when an audit task is rerouted to `8005` due to protected-endpoint policy.

## Documentation

- Update runtime/provider docs to state that `8003` and `8005` are protected remote model endpoints and must not be stress-tested locally.
- Document queue options and lifecycle logs.
- Keep the user's operational rule explicit: service/e2e validation should target `192.168.88.67`; local service testing should not be used for this repo.

## Verification strategy

- Unit tests for qwen-local-agent queue:
  - serializes concurrent requests to the same protected endpoint;
  - queue timeout fails before fetch;
  - external/run timeout aborts in-flight fetch;
  - structured lifecycle logs include required metadata and no raw prompt/header.
- Coordinator tests:
  - failed profile attribution uses runtime error metadata, not recomputed fallback profile;
  - audit task selected on `8003` reroutes to enabled compatible `8005` profile.
- Static verification:
  - targeted package tests;
  - `npm.cmd run build` if targeted tests pass and time permits.
