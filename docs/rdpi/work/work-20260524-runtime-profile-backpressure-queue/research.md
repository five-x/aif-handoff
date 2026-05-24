# Research

## Task framing and lane

- Task id: `work-20260524-runtime-profile-backpressure-queue`.
- Lane: `work`.
- User input: runtime host `192.168.88.62` did not show crash/OOM/reset. The observed problem is endpoint backpressure/saturation on single-slot `8003`, while `8005` was idle; AIF metadata sometimes reported failed profile `aeb6.../8005` while `usage_events` timeout rows pointed to `b7a9.../8003`.
- Required AIF changes:
  - per-profile concurrency limit 1 for `8003` and `8005`;
  - bounded queue and pre-runtime queue timeout;
  - request start/end/cancel logging with `taskId`, `profileId`, `baseUrl`, `model`, `duration`, `timeoutMs`, and HTTP/error;
  - fix profile accounting mismatch between `usage_events` and recovery/activity;
  - propagate cancel on timeout so llama-server does not continue abandoned requests;
  - route long audit tasks to `8005`; keep `8003` on hard context/output budgets.
- Constraint from the user: do not run local service validation. All service checks belong to `192.168.88.67`; local verification should be source/test/build level unless explicitly authorized.

## Accepted planning sources or local facts

- `$rdpi` preflight was run and returned `STATUS: ready`.
- `AGENTS.md` confirms this is a Node/TypeScript repo and docs under `docs/rdpi/` are the source of truth.
- Current worktree is dirty with many pre-existing edits. This task must avoid reverting or normalizing unrelated changes.
- `packages/runtime/src/adapters/qwenLocalAgent/api.ts:42` already contains endpoint-specific budgets for `8003` and `8005`.
- `packages/runtime/src/adapters/qwenLocalAgent/api.ts:98` has in-memory endpoint semaphore state, but current acquisition waits unboundedly until abort.
- `packages/runtime/src/adapters/qwenLocalAgent/api.ts:260` combines run timeout and external abort with `AbortSignal.timeout`, which can abort fetch but does not give AIF a distinct queue-timeout lifecycle reason.
- `packages/runtime/src/adapters/qwenLocalAgent/api.ts:1250` acquires endpoint semaphore by endpoint key, not profile id, and has no bounded queue length or queue timeout.
- `packages/runtime/src/adapters/qwenLocalAgent/api.ts:1301` sends `/chat/completions` and logs request estimates, but the event name is not a clear start/end/cancel request lifecycle log.
- `packages/agent/src/coordinator.ts:304` has runtime profile concurrency logic; `packages/agent/src/coordinator.ts:347` maps protected `8003`/`8005` endpoints to semaphore keys. This is scheduler-level gating, not a runtime request queue.
- `packages/agent/src/coordinator.ts:713` and `packages/agent/src/coordinator.ts:831` implement fallback/retry handling around transient/runtime timeouts. Mismatch can arise here if the selected retry/fallback profile is persisted as failed rather than the profile actually used by the timed-out request.
- `packages/agent/src/subagentQuery.ts:583` resolves the effective runtime profile and `packages/agent/src/subagentQuery.ts:1187` builds the runtime input with `profileId: context.profileId`. Failed usage rows use the run input profile, while coordinator recovery recomputes selections from task state.
- `packages/runtime/src/registry.ts:230` records failed usage events with `profileId: input.profileId`, so `usage_events` is likely the most accurate record of the attempted runtime profile.
- `packages/shared/src/schema.ts:388` shows `usage_events` has profile/runtime/transport/workflow/outcome/error fields but no base URL/model/duration/request lifecycle fields.
- Existing tests in `packages/runtime/src/__tests__/qwenLocalAgent.test.ts` cover endpoint budgets, compaction, retry count logging, and request-estimate logging. They are the right place for bounded queue/cancel/lifecycle logging adapter tests.
- Existing coordinator tests around `packages/agent/src/__tests__/coordinator.test.ts:2555` and later cover audit routing and fallback behavior. They are the right place to lock profile-accounting and long-audit routing semantics.

## Same-project memory

- Shared memory was reachable with 2018 processed documents.
- Memory recall only provided older runtime profile observations for `botIntevra`, including `8003` and `8005` profile defaults. It did not contain curated knowledge about this specific backpressure, queue timeout, or `usage_events`/fallback mismatch.
- Local code and live task facts outrank memory for this change.

## Cross-project reusable patterns

- No cross-project memory pattern is needed beyond the local runtime/profile contracts.

## Rejected or stale memory candidates

- The memory item that named old model files under `Qwen3-32B...` is stale relative to the current live profiles observed earlier in this thread (`Qwen3.6-27B-Q5_K_M-mtp.gguf` on `8003`, `Qwen3.6-35B-A3B-MTP-UD-Q5_K_XL.gguf` on `8005`), so it is not used for implementation decisions.
