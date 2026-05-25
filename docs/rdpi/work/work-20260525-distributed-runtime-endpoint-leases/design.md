# Design

## Target behavior

AIF should treat protected Qwen endpoints on ports `8003` and `8005` as shared single-slot resources across all AIF processes that use the same database. Before a protected endpoint request reaches `/chat/completions`, the runtime path must hold a distributed endpoint lease. Only the lease holder may heartbeat, renew, release, or cancel that lease.

The existing process-local semaphore remains as a fast local guard and fallback for deployments without a lease manager. The new distributed lease sits inside the same request dispatch boundary, so direct API/chat calls and subagent runs share the same endpoint protection.

## Lease identity and state

Persist one active lease row per normalized endpoint key, scoped by:

- `endpointKey`: normalized `protocol://host:port`, the actual single-slot resource key.
- `profileId`: the selected runtime profile id for observability and stale-holder diagnostics.
- `baseUrl`: the configured endpoint URL.
- `runtimeId` / `providerId`: runtime identity metadata.
- `taskId`: task scope when present.
- `holderId`: stable process holder id, supplied by the host process.
- `leaseToken`: random token proving ownership for heartbeat/release/cancel.
- `heartbeatAt`: last holder heartbeat.
- `leaseExpiresAt`: TTL deadline after which another process may recover the slot.
- `cooldownUntil`: shared endpoint cooldown deadline.
- `cooldownFailureCount` and `cooldownReason`: shared cooldown diagnostics.

Endpoint key, not host alone, is the saturation scope. A saturated `192.168.88.62:8003` must not mark `192.168.88.62:8005` unavailable.

## Data layer contract

Add `runtime_endpoint_leases` in `@aif/shared` schema and `db.ts` ensure/migration DDL. Add `@aif/data` helpers:

- acquire a lease by inserting/updating only when no active lease exists, the current lease is expired, or the same holder/token is renewing;
- return a contended result with current holder/cooldown metadata instead of throwing;
- heartbeat/renew only when holder and lease token match;
- release only when holder and lease token match;
- cancel/release by holder/task/token for explicit cancellation paths;
- release stale leases by TTL for recovery;
- set/read shared cooldown by endpoint key.

Use the existing task-claim pattern: conditional writes with TTL checks, owner-scoped release, and stale recovery tests.

## Runtime integration

Do not import `@aif/data` from `packages/runtime`. Introduce a runtime-layer `RuntimeEndpointLeaseStore` or similarly named structural interface in `packages/runtime/src/types.ts`, carried through `RuntimeExecutionIntent` or adapter factory options. The Qwen adapter uses it only when present.

For protected endpoints:

1. Keep the existing local queue limit and queue timeout so a process can bound local waiters.
2. When dequeued locally and before `fetch()`, wait for shared cooldown if it is short enough; otherwise fail with `endpoint_cooldown`.
3. Attempt distributed lease acquisition in a bounded wait loop until acquired, aborted, queue timeout elapses, or cooldown blocks the request.
4. Start a heartbeat timer after acquisition and stop it on any release/cancel/failure path.
5. Call `/chat/completions` only while the lease is held.
6. Explicitly release on success, HTTP error, timeout, and cancellation.

If no lease manager is configured, preserve current single-process behavior.

## Failure and cooldown semantics

Queue-local outcomes stay local non-failures:

- `endpoint_queue_timeout`
- `endpoint_queue_full`
- `endpoint_request_cancelled`

These must not trip shared cooldown or cause the runtime host to be marked unavailable.

In-flight transport/stream/runtime timeout failures may set shared endpoint cooldown by endpoint key. Cooldown is read before future dispatch by all processes. The existing in-memory circuit breaker can remain as a local cache, but shared cooldown is authoritative when a lease manager exists.

Queue timeout before distributed acquisition or before `fetch()` is classified as AIF backpressure, not a provider service failure. Provider metadata should include endpoint key, holder id when available, lease token redacted/opaque when logged, profile id, task id, base URL, wait duration, TTL, and timeout.

## Host wiring

Provide a DB-backed lease manager from `@aif/data` and inject it where host processes already bootstrap runtime registries:

- agent process bootstrap;
- subagent runtime registry creation;
- API runtime service bootstrap for chat/roadmap/fast-fix flows if they can hit protected endpoints.

Use a holder id that is stable per process and distinct across processes. The existing coordinator id can be part of the agent holder id; API can use a generated process id.

## Tests

Data tests prove the persistence contract:

- acquire/release by holder token;
- second holder contends while active;
- heartbeat extends TTL;
- expired lease can be recovered by stale holder;
- release/cancel does not affect a different token;
- shared cooldown is endpoint-scoped.

Runtime tests prove integration using a fake shared lease manager:

- two adapter instances contending for the same endpoint never fetch concurrently;
- lease expiration/stale recovery allows the second holder to proceed;
- queue timeout before dispatch does not call fetch and does not set cooldown;
- cancellation while waiting releases/does not acquire and propagates cancellation;
- in-flight timeout/cancel releases the lease;
- shared cooldown prevents immediate repeat saturation across separate adapter instances.

Targeted agent or bootstrap tests prove the DB-backed manager is injected without breaking runtime/data package boundaries.
