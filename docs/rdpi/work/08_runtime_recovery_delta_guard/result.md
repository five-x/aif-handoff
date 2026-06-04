# Result - 08_runtime_recovery_delta_guard

## Scope

- Implemented a coordinator-owned runtime recovery delta guard.
- Runtime recovery attempts now persist structured `runtime_recovery` / `delta_guard` task-stage artifact attempts.
- No-delta comparison uses only the six required fields:
  - artifact SHA
  - validator fingerprint
  - tool-loop pattern
  - blocked-reason family
  - evidence refs
  - source snapshot identity/fingerprint
- Diagnostic fields such as runtime category, failed profile id, stage, artifact path, and public fingerprint are persisted for observability but do not make an otherwise identical six-field match eligible for retry.

## Category Matrix

| Category                                  | No Delta                                                                                                                                                                    | Delta Present                                           |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `timeout`                                 | `blocked_external`; `blockedReason` starts with `runtime_recovery_no_delta_fail_closed:<reason>`; no retry; `retryAfter=null`; `retryCount` unchanged                       | Existing bounded recovery policy applies                |
| `context_length`                          | `blocked_external`; no compatible fallback retry; `retryAfter=null`; `retryCount` unchanged; generic fallback block does not require manual review                          | Existing compatible fallback policy applies             |
| `transport`                               | `blocked_external`; no transient fallback retry; `retryAfter=null`; `retryCount` unchanged                                                                                  | Existing transient fallback/backoff policy applies      |
| `stream`                                  | `blocked_external`; no transient fallback retry; `retryAfter=null`; `retryCount` unchanged                                                                                  | Existing transient fallback/backoff policy applies      |
| `repository_inspection_budget_exhaustion` | No larger fallback retry; repeated no-delta uses `runtime_recovery_no_delta_fail_closed:repository_inspection_budget_exhaustion`; `manualReviewRequired=true`               | Existing terminalization/manual-review behavior applies |
| Post-write audit artifact failure         | No rework retry for the same artifact SHA, validator fingerprint, evidence refs, blocked-reason family, tool-loop pattern, and source snapshot; `manualReviewRequired=true` | Existing validation-guided recovery applies             |

## Gate Outcomes

- Explorer: completed read-only research.
- Plan review first pass: `PLAN FAIL`; fixed equality criteria, exact blocked-reason prefix, explicit timeout/transport/stream coverage, and manual-review assertions.
- Plan review second pass: `PLAN FAIL`; fixed stale prefix in `research.md` and added repository-inspection manual-review assertion.
- Plan review third pass: `PLAN PASS`.
- Coder: implemented coordinator guard and focused tests.
- Tester first pass: `TEST FAIL`; build failed because `reportArtifact` was declared in the wrong scope.
- Coder revision: moved `reportArtifact` into the transient fallback no-delta branch and removed the unused declaration.
- Tester rerun: `TEST PASS`.
- Final review first pass: `REVIEW FAIL`; `result.md` was missing.
- Final review second pass: `REVIEW PASS`; no blocking implementation or close-out issues after `result.md` was added.
- Post-memsync close-out review first pass: `REVIEW FAIL`; this result document omitted the final review second-pass `REVIEW PASS`.
- Post-memsync close-out review second pass: `REVIEW PASS`; no blocking close-out or memsync-report issues.
- User waivers: none.
- Skipped roles: none.

## Verification

- `npm.cmd --workspace @aif/agent test -- --run src/__tests__/coordinator.test.ts -t "no-delta|same audit artifact delta|artifact sha changes|same six delta fields repeat"` - pass, 8 tests.
- `npm.cmd --workspace @aif/agent test -- --run src/__tests__/coordinator.test.ts` - pass.
- `npm.cmd --workspace @aif/agent test -- --run src/__tests__/stageErrorHandler.test.ts` - pass, 34 tests.
- `npm.cmd --workspace @aif/agent run lint` - pass with one existing warning in `packages/agent/src/subagents/reviewer.ts` for unused `runRequiredSpecializedReviewers`.
- `npm.cmd run build` - pass, Turbo build succeeded.

## Notes

- Unrelated pre-existing dirty files such as `docs/kb/windows-codex-bootstrap-validation.md`, existing `docs/memory/decisions/**`, existing `docs/memory/patterns/**`, `docs/memory/tasks/work/04_aif_result_contract_and_output-*`, and `docs/rdpi/work/04_aif_result_contract_and_output/result.md` were preserved. Memsync for this task generated the task 08 memory artifacts and refreshed the project/entity capsules.
- `$memsync MODE=auto LANE=work TASK_ID=08_runtime_recovery_delta_guard` completed local memory-review artifact generation and skipped auto-publish because there were no publishable curated documents.
- Command: `python "$env:USERPROFILE\.codex\tools\codex-memsync.py" --repo . --mode auto --lane work --task-id 08_runtime_recovery_delta_guard --project aif-handoff --entity aif-handoff`
- Report: `docs/memory/reports/08_runtime_recovery_delta_guard-memsync-report.md`.
