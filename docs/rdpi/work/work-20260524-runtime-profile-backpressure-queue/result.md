# Result

## Outcome

Implemented the AIF-side protected endpoint backpressure fix for qwen-local-agent and coordinator runtime profile accounting.

## Changes

- Added bounded process-local queueing for protected qwen-local-agent endpoints `8003` and `8005`.
- Kept protected endpoint concurrency at one active request per normalized endpoint key.
- Added queue-full and queue-timeout failures before `/chat/completions` fetch starts.
- Ensured `endpoint_queue_timeout`, `endpoint_queue_full`, and local request cancel do not trip endpoint circuit/cooldown.
- Added structured qwen-local-agent request lifecycle logging for queued, dequeued, start, end, timeout, cancel, queue-full, and queue-timeout outcomes.
- Ensured timeout/cancel aborts the active fetch signal.
- Added runtime error provider metadata with attempted `taskId`, `profileId`, `baseUrl`, `model`, endpoint key, duration, timeout, and status.
- Preserved attempted runtime metadata when wrapping provider failures in endpoint cooldown errors.
- Preserved attempted runtime metadata when a request is rejected by an already-open endpoint cooldown gate before fetch.
- Released protected endpoint slots when a queued request is cancelled during dequeue handoff.
- Updated coordinator recovery to prefer attempted failed profile id from `RuntimeExecutionError.providerMeta.profileId`.
- Added coordinator activity attribution for external runtime backoff errors that carry attempted profile metadata.
- Added audit-stage routing from protected `8003` to compatible enabled `8005` profile when available.
- Updated provider/runbook docs to state service, API, UI, audit-quality, and e2e validation are remote-only against `192.168.88.67`, not local service testing.

## Files

- `packages/runtime/src/adapters/qwenLocalAgent/api.ts`
- `packages/runtime/src/__tests__/qwenLocalAgent.test.ts`
- `packages/agent/src/coordinator.ts`
- `packages/agent/src/__tests__/coordinator.test.ts`
- `docs/providers.md`
- `docs/ops/runbook.md`

## Gates

- `PLAN PASS`: independent reviewer accepted the revised plan after queue-local failures were defined as non-cooldown outcomes and the process-local concurrency boundary was documented.
- `TEST PASS`: independent tester verified the first implementation and documentation without starting local services.
- `REVIEW FAIL`: final reviewer found that endpoint cooldown wrapping dropped attempted-profile metadata and that abort during queue handoff could leak the protected endpoint slot.
- Revision completed: cooldown metadata preservation, handoff-abort slot release, and regression tests were added.
- `REVIEW FAIL`: rerun reviewer found that already-open endpoint cooldown gate errors still dropped attempted-profile metadata.
- Second revision completed: cooldown gate errors now include attempted metadata and coordinator logs persisted failed-profile attribution for retry-after backoff.
- `TEST PASS`: independent tester reran the local verification after the second revision.
- `REVIEW PASS`: independent final reviewer found no blocking issues against the scoped final snapshot.

## Verification

- `npm.cmd test --workspace=@aif/runtime -- qwenLocalAgent`
  - Pass after revision: `1` file, `96` tests.
- `npm.cmd test --workspace=@aif/agent -- coordinator`
  - Pass after second revision: `99` tests.
- `npm.cmd run build`
  - Pass: `7` packages built successfully.
- `npm.cmd run lint --workspace=@aif/runtime`
  - Pass.
- `npm.cmd run lint --workspace=@aif/agent`
  - Pass.
- `git diff --check -- packages/runtime/src/adapters/qwenLocalAgent/api.ts packages/runtime/src/__tests__/qwenLocalAgent.test.ts packages/agent/src/coordinator.ts packages/agent/src/__tests__/coordinator.test.ts docs/providers.md docs/ops/runbook.md docs/rdpi/work/work-20260524-runtime-profile-backpressure-queue/result.md`
  - Pass.
- `python "$env:USERPROFILE\.codex\tools\codex-flow-audit.py" --repo .`
  - Pass: `STATUS: clean`.

## Remote Validation Boundary

No local AIF service, localhost browser, or localhost e2e validation was run. Service and audit-quality checks remain remote-only against `http://192.168.88.67/` / `http://192.168.88.67/api`.

## Remote Audit-Quality Follow-Up

- Remote task `866c5874-6f42-412b-a8a6-45adb1c5b728` was observed in `blocked_external` after repeated `8003` timeouts.
- The task was rerouted through the remote API to project profile `c3f921a5-d92e-4ef5-a8ec-82c93ef39f33` (`http://192.168.88.62:8005/v1`), stale `__aifRuntimeRecovery` state was cleared, and the state-machine event `retry_from_blocked` resumed it.
- The resumed run produced `audit/remote-audit-quality-20260524-botintevra-data-safety.md` and reached review, proving the remote-only `8005` route can carry the long audit farther than the previous `8003` retries.
- Audit quality did not pass: final state returned to `blocked_external` with `manualReviewRequired=true` after review iteration 2. The completion guard cited `uncommitted_report_artifact`, `invalid_or_missing_file_references`, `invalid_report_manifest`, `low_quality_report_evidence`, and malformed structured review output.
- The review also carried a High finding that the audit report contained fabricated or misleading evidence. This is a separate audit-quality defect, not a runtime-host crash/OOM/reset finding.

## Memory Sync

- `$memsync MODE=auto LANE=work TASK_ID=work-20260524-runtime-profile-backpressure-queue` completed the local memory-review phase.
- Command: `python "$env:USERPROFILE\.codex\tools\codex-memsync.py" --repo . --mode auto --lane work --task-id work-20260524-runtime-profile-backpressure-queue --project aif-handoff --entity aif-handoff`
- Status: `skipped` publish, because there were no publishable curated documents.
- Report: `docs/memory/reports/work-20260524-runtime-profile-backpressure-queue-memsync-report.md`.

## Residual Risk

The queue/semaphore guarantee is process-local. If multiple independent AIF processes can send to the same `192.168.88.62:8003` or `192.168.88.62:8005` endpoint, a shared external lease or single writer process is still required.
