# Runtime Endpoint Leases

Runtime endpoint leases protect single-slot local model endpoints such as Qwen `8003` and `8005` across AIF processes that share the same SQLite database.

## Contract

- Lease scope is the normalized endpoint key: `protocol://host:port`.
- Lease rows live in `runtime_endpoint_leases`.
- Active leases record runtime/profile metadata, base URL, holder id, task id, lease token, heartbeat, TTL, and expiry.
- Holder and lease token are required for heartbeat and release.
- Expired leases can be recovered by another holder.
- Shared cooldown is endpoint-scoped; cooling down `192.168.88.62:8003` must not mark `192.168.88.62:8005` or the whole host unavailable.

## Runtime Behavior

- `@aif/runtime` owns the adapter-side lease interface and does not import `@aif/data`.
- Host processes inject `createDbRuntimeEndpointLeaseStore()` during runtime registry bootstrap.
- Qwen protected endpoint dispatch keeps the process-local queue as a fast fallback and acquires the shared lease before calling `/chat/completions`.
- Queue timeout/full/cancel remain AIF backpressure outcomes and must not trip shared cooldown.
- In-flight transport/timeout failures may set shared cooldown for the endpoint key.

## Validation Boundary

Do not run local AIF service, browser, or local e2e checks for this path. Runtime/e2e validation for this repo belongs on the remote target `192.168.88.67`.
