# Result: Distributed Runtime Endpoint Leases

Date: 2026-05-25
Task ID: `work-20260525-distributed-runtime-endpoint-leases`
Lane: `work`

## Outcome

Implemented DB-backed runtime endpoint leases for protected qwen-local-agent endpoints. The runtime now coordinates endpoint dispatch across processes through an injected lease store, keeps the lease held through response body consumption, persists shared cooldown before releasing on transport/timeout failures, and fails closed if lease heartbeat renewal cannot prove ownership.

## Implementation

- Added `runtime_endpoint_leases` schema and migration version 35 with indexes for holder/token, task, expiry, and cooldown lookups.
- Added `createDbRuntimeEndpointLeaseStore()` and stale-release support in `@aif/data`, covering acquire, heartbeat, release, cancel, cooldown read/write, and owner-token safety.
- Added `RuntimeEndpointLeaseStore` to runtime execution intent and wired lease-store injection through runtime bootstrap, API runtime service, agent coordinator, and subagent query paths.
- Updated qwen-local-agent protected endpoint dispatch to use local semaphore plus distributed lease acquisition, shared cooldown checks, heartbeat renewal, cooldown persistence, and ordered release.
- Added runtime regressions for shared lease acquisition/release, remote-holder timeout before fetch, delayed-body contention across holders, cooldown-before-release ordering, heartbeat false/throw fail-closed behavior, and shared cooldown pre-dispatch blocking.
- Added `docs/kb/runtime-endpoint-leases.md` to document the lease contract and validation boundary.

## Gates

- `PLAN PASS`: independent plan review passed before implementation.
- `TEST PASS`: independent tester passed after final fixes.
- `REVIEW PASS`: independent reviewer passed after final fixes.

## Verification

- `npm.cmd test --workspace=@aif/runtime -- qwenLocalAgent` passed: 109 tests.
- `npm.cmd test --workspace=@aif/shared -- db` passed: 17 tests.
- `npm.cmd test --workspace=@aif/data -- index` passed.
- `npm.cmd test --workspace=@aif/api -- runtimeService` passed: 33 tests.
- `npm.cmd test --workspace=@aif/agent -- subagentQuery` passed: 40 tests.
- `npm.cmd test --workspace=@aif/runtime -- bootstrap` passed: 11 tests.
- `npm.cmd run lint` passed: 10/10 turbo tasks.
- `npm.cmd run build` passed: 7/7 turbo tasks.

## Known Unrelated Failure

The broad command `npm.cmd test --workspace=@aif/agent -- qwenLocalAgent coordinator` still fails in `packages/agent/src/__tests__/coordinator.test.ts:1039`, expecting `invalid_inventory_only` while the current dirty audit/trust lifecycle work reports `invalid_artifact_contract: Completion evidence guard...`. The independent tester found no causal link to endpoint leases. This was not fixed under this task.

## Memory Sync

`$memsync MODE=auto LANE=work TASK_ID=work-20260525-distributed-runtime-endpoint-leases` completed local memory review artifact generation.

- Command: `python "$env:USERPROFILE\.codex\tools\codex-memsync.py" --repo . --mode auto --lane work --task-id work-20260525-distributed-runtime-endpoint-leases --project aif-handoff --entity aif-handoff`
- Status: `skipped` publish because there were no publishable curated documents.
- Report: `docs/memory/reports/work-20260525-distributed-runtime-endpoint-leases-memsync-report.md`
- Task delta: `docs/memory/tasks/work/work-20260525-distributed-runtime-endpoint-leases-delta.md`
