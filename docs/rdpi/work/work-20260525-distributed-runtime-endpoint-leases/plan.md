# Plan

## Scope

In scope:

- SQLite-backed endpoint lease/cooldown state in `@aif/shared` schema/DDL and `@aif/data`.
- Runtime-layer lease-store interface with qwen-local-agent integration.
- Host bootstrap injection for agent/API runtime registries where protected Qwen endpoints can be used.
- Targeted data/runtime/agent tests and source-level verification.
- RDPI result and memory review artifacts after implementation.

Out of scope:

- Running local AIF service, local browser, local e2e checks, or loopback smoke tests.
- Changing model-server configuration on `192.168.88.62`.
- Live remote canary execution against `192.168.88.67` unless an explicit later verification window is provided.
- Reverting or normalizing unrelated dirty worktree changes.

## Implementation steps

1. Add the persisted lease model.
   - Add `runtimeEndpointLeases` to `packages/shared/src/schema.ts`.
   - Add create-table DDL, migration entry, and indexes in `packages/shared/src/db.ts`.
   - Export table/types through `@aif/shared` where needed.

2. Add data-layer lease helpers.
   - Implement acquire, heartbeat/renew, release, cancel/release by holder/task, stale cleanup, read cooldown, and set cooldown in `packages/data/src/index.ts`.
   - Keep writes conditional on holder and lease token.
   - Return structured contention/cooldown results so runtime can classify queue wait vs provider failure.

3. Define runtime lease interfaces.
   - Add a structural `RuntimeEndpointLeaseStore` contract to `packages/runtime/src/types.ts`.
   - Include acquire/heartbeat/release/cooldown methods and redaction-safe metadata types.
   - Thread the optional store through the qwen-local-agent adapter via execution hooks or adapter factory options without importing data-layer code.

4. Integrate qwen-local-agent dispatch.
   - Wrap protected endpoint dispatch with local semaphore plus distributed lease acquisition.
   - Heartbeat while fetch is in flight and always stop/release in `finally`.
   - Preserve current process-local fallback when no lease store is present.
   - Preserve queue timeout/full/cancel as local non-failure statuses.
   - Promote transport/stream/in-flight timeout failures to shared cooldown by endpoint key.

5. Inject DB-backed lease stores in host layers.
   - Add `createDbRuntimeEndpointLeaseStore` or equivalent in `@aif/data`.
   - Pass it into agent and API runtime registry bootstrap paths.
   - Use distinct process holder ids with task id/profile/base URL metadata.

6. Add/extend tests.
   - Data tests in `packages/data/src/__tests__/index.test.ts` for lease lifecycle, TTL, stale recovery, owner-token safety, and cooldown.
   - Runtime tests in `packages/runtime/src/__tests__/qwenLocalAgent.test.ts` with two adapter/store instances contending for one endpoint.
   - Agent/API bootstrap tests only where needed to prove injection and package boundaries.

7. Update docs and RDPI result.
   - Update operational docs/runbook only for source-level lease settings and the no-local-service verification rule.
   - Record gate results, files changed, verification commands, and residual remote-canary risk in `result.md`.

## Acceptance criteria

- Per-profile/protected-endpoint concurrency is enforced across AIF processes sharing the DB, not only within one process.
- Lease metadata includes holder, task id, profile id, base URL, lease token, heartbeat, TTL, and explicit release/cancel paths.
- Queue timeout before runtime dispatch does not call fetch and is not treated as runtime service failure.
- Shared cooldown blocks immediate repeat saturation across processes and is scoped by endpoint key, not host.
- Existing single-process behavior still works when no distributed lease manager is configured.
- Tests cover two adapter instances contending for one endpoint, lease expiration, stale holder recovery, shared cooldown, queue timeout, and cancellation propagation.

## Verification plan

- `npm.cmd test --workspace=@aif/data -- index`
- `npm.cmd test --workspace=@aif/runtime -- qwenLocalAgent`
- `npm.cmd test --workspace=@aif/agent -- qwenLocalAgent coordinator`
- `npm.cmd run lint`
- `npm.cmd run build`
- `python "$env:USERPROFILE\.codex\tools\codex-flow-audit.py" --repo .`

No local service, browser, or e2e verification will be run.

## Gate requirements

- Independent `PLAN PASS` is required before implementation.
- Independent `TEST PASS` is required after implementation.
- Independent `REVIEW PASS` is required before close-out.
- `$memsync MODE=auto LANE=work TASK_ID=work-20260525-distributed-runtime-endpoint-leases` is required before marking the intake task done.
