# Research

## Task framing and lane

- Task id: `work-20260525-distributed-runtime-endpoint-leases`.
- Lane: `work`.
- Intake request: move runtime endpoint saturation protection from process-local in-memory guards to distributed endpoint leases and cooldowns for single-slot Qwen endpoints such as `8003` and `8005`.
- Required lease contract: endpoint/profile identity, holder, task id, lease token, heartbeat, TTL, cancellation behavior, and shared cooldown state.
- Main success condition: multiple AIF processes must not overload the same single-slot endpoint, while queue timeout before runtime dispatch must not count as runtime service failure.
- Operational constraint: do not run local AIF service, local browser, or local e2e checks. Runtime/e2e verification is remote-only against `192.168.88.67`.

## Accepted planning sources or local facts

- `$runtask` preflight ran `codex-ensure-rdpi.py` and returned `STATUS: ready`.
- `codex-flow-audit.py --repo .` returned `STATUS: clean`.
- `AGENTS.md` identifies this as a Node/TypeScript repo and requires RDPI gates for non-trivial work. It also says local repo facts outrank memory recall.
- Current worktree is dirty with many unrelated edits. This run must preserve unrelated work and avoid broad reformatting.
- Prior RDPI task `docs/rdpi/work/work-20260524-runtime-profile-backpressure-queue/` states its protection was process-local and explicitly did not solve distributed leases across multiple AIF processes.
- `packages/runtime/src/adapters/qwenLocalAgent/api.ts` currently holds endpoint protection in process-local `Map`s: `endpointSemaphores` and `endpointCircuitBreakers`.
- `packages/runtime/src/adapters/qwenLocalAgent/api.ts` already scopes protected local endpoint budgets to ports `8003` and `8005`, derives endpoint identity as `protocol://host:port`, distinguishes queue timeout/full/cancel as local non-failures, and logs request lifecycle metadata.
- `packages/runtime/src/adapters/qwenLocalAgent/api.ts` enforces current active-slot/queue behavior in `acquireEndpointSemaphore`, `withEndpointSemaphore`, `assertEndpointCircuitAllowsRequest`, and `recordEndpointFailure`.
- `packages/runtime/src/__tests__/qwenLocalAgent.test.ts` already covers process-local serialization, queue timeout/full, cancellation while waiting, cooldown, HTTP retry, and abort propagation.
- `packages/data/src/index.ts` has the closest DB-backed claim pattern in task claims: conditional claim, renew, owner-scoped release, and stale release.
- `packages/data/src/__tests__/index.test.ts` already tests claim/release/renew/stale recovery behavior and is the natural home for data-layer lease tests.
- `packages/shared/src/schema.ts` and `packages/shared/src/db.ts` are the schema and migration sources for SQLite-backed tables.
- `eslint.config.mjs` forbids `packages/runtime` from importing `@aif/data`, Drizzle, or SQLite. The runtime adapter must receive a lease coordinator abstraction through options/execution/bootstrap rather than importing the data layer.
- `packages/runtime/src/types.ts` defines `RuntimeExecutionIntent` as the adapter-neutral execution bag; it can carry an optional opaque hook/manager without forcing data dependencies into runtime.
- `packages/agent/src/index.ts`, `packages/agent/src/subagentQuery.ts`, and `packages/api/src/services/runtime.ts` already inject DB-backed usage sinks into the runtime registry during bootstrap. These host layers are appropriate places to inject a DB-backed endpoint lease manager.
- `packages/agent/src/coordinator.ts` has process-local scheduler semaphores for runtime profiles/endpoints, including protected endpoint routing to `8005` for audit. Those prevent obvious same-process scheduling collisions but cannot coordinate independent processes.

## Same-project memory

- Shared-memory recall was not used before `PLAN PASS` because the RDPI boundary in `AGENTS.md` forbids shared-memory recall before plan approval unless explicitly waived.
- Local repo facts and the prior local RDPI artifacts were sufficient to produce the plan.

## Cross-project reusable patterns

- No cross-project memory was consulted before `PLAN PASS`.
- Reusable pattern selected from local code: mirror the existing task-claim shape with conditional DB writes, holder-scoped renewal/release, TTL-based stale recovery, and tests against a shared test DB.

## Rejected or stale memory candidates

- No shared-memory candidates were read.
- Profile id alone is rejected as the lease key because multiple profiles can point at the same `baseUrl`; endpoint key must include normalized endpoint identity, with profile identity kept as metadata and optionally part of observability.
