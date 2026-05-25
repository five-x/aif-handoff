# Distributed Runtime Endpoint Leases

- Task ID: work-20260525-distributed-runtime-endpoint-leases
- Lane: work
- Status: done
- Priority: high
- Created: 2026-05-25
- Due: after P0 trusted audit artifact tasks
- Source: External independent review `operator-supplied external review file aif-independent-code-review-6713a389.md` for commit `6713a389e326cadbeeb5f7c244f491a02ec15c55` and prior runtime backpressure findings.
- RDPI Needed: yes
- RDPI Path: `docs/rdpi/work/work-20260525-distributed-runtime-endpoint-leases`

## Request

Move runtime endpoint saturation protection from process-local in-memory guards to distributed endpoint leases and cooldowns for single-slot runtime endpoints such as `8003` and `8005`.

The lease contract should include endpoint/profile identity, holder, task id, lease token, heartbeat, TTL, cancellation behavior, and shared cooldown state so multiple AIF processes cannot overload the same single-slot runtime endpoint.

## Done When

- Per-profile endpoint concurrency is enforced across AIF processes, not only within one process.
- Endpoint leases have holder, task id, profile id, base URL, lease token, heartbeat, TTL, and explicit release/cancel paths.
- Queue timeout before runtime dispatch does not count as runtime service failure.
- Shared cooldown prevents immediate repeat saturation across processes.
- Tests cover two adapter instances contending for the same endpoint, lease expiration, stale holder recovery, shared cooldown, queue timeout, and cancellation propagation.

## Constraints

- Preserve existing per-profile concurrency limit behavior for single-process deployments.
- Do not mark `192.168.88.62` runtime host as unavailable solely because a single endpoint queue is saturated.
- Do not run local AIF service, local browser, or local e2e checks. Runtime/e2e verification is remote-only against `192.168.88.67`.
- This intake card does not execute the task.

## Verification Plan

- Source tests with two simulated adapter/coordinator instances sharing the same lease store.
- Data-layer tests for lease TTL, heartbeat, release, and stale holder recovery if the lease store is database-backed.
- Remote-only runtime canary against `192.168.88.67` after implementation.
- `npm.cmd test --workspace=@aif/agent -- qwenLocalAgent coordinator`
- `npm.cmd test --workspace=@aif/data -- index`
- `npm.cmd run lint`
- `npm.cmd run build`
