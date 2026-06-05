# Result - 11_observability_and_metrics

## Implemented

- Added shared guardrail observability primitives in `packages/shared/src/guardrailObservability.ts`.
- Exported the helper from `@aif/shared`.
- Added log-backed structured counter emission for:
  - `agent_tool_loop_blocked_total` in the agent runtime event bridge.
  - `agent_write_path_denied_total` in the agent runtime event bridge.
  - `agent_checklist_incomplete_block_total` in the implementer checklist hard stop.
  - `agent_invalid_manifest_rejected_total` in implementation manifest rejection.
  - `agent_same_failure_fail_closed_total` in coordinator and API same-fingerprint fail-closed paths.
  - `agent_split_required_decision_total` in planner split-required routing.
  - `agent_prompt_contract_missing_total` in implementer AIF result-contract rejection.
  - `agent_runtime_recovery_no_delta_total` in coordinator runtime recovery no-delta fail-closed handling.
  - `agent_operator_verified_completion_accepted_total` in operator verified completion acceptance.
  - `agent_operator_verified_completion_rejected_total` in operator verified completion rejection.
- Added diagnostic `guardrail_event` task-stage artifact attempts for evidence-related guardrails.
- Preserved existing guard decisions and status transitions; observability is additive.
- Documented guardrail counters in `docs/configuration.md`.

## Verification

- Gate outcomes:
  - Explorer: completed read-only research.
  - Plan review first pass: `PLAN FAIL`; revised artifact state semantics, path redaction, and single-owner emission rules.
  - Plan review rerun: `PLAN PASS`.
  - Coder: completed implementation.
  - Tester: `TEST PASS`.
  - Lead sanitizer hardening after tester: redacted bare `key`, `keys`, `.ssh`, and common SSH private-key path segments; focused shared test rerun passed.
  - Lead API completion-evidence hardening after tester: added API-side `agent_prompt_contract_missing_total` emission for `missing_aif_result_contract` completion-evidence blocks/rework.
  - Tester rerun after sanitizer/API prompt-contract hardening: `TEST PASS`.
  - Final review first pass: `REVIEW FAIL`; reviewer found operator rejection guardrail attempts could persist raw rejection summaries containing submitted file names, and requested explicit documentation of pre-existing unrelated worktree changes.
  - Lead final-review fix: operator verified completion guardrail attempts now derive summaries only from the sanitized action and reason code; added a regression for secret-like rejected paths.
  - Tester rerun after final-review fix: `TEST PASS`.
  - Final review second pass: `REVIEW FAIL`; reviewer found the terminal completion-evidence same-failure branch in the coordinator still emitted only legacy activity.
  - Lead same-failure branch fix: the terminal completion-evidence branch now emits `agent_same_failure_fail_closed_total` and a diagnostic `guardrail_event` attempt without changing the existing blocked status behavior.
  - Tester rerun after same-failure branch fix: `TEST PASS`.
  - Final review rerun: `REVIEW PASS`.
  - User waivers: none.
  - Skipped roles: none.
- `npm.cmd --workspace @aif/shared test -- --run src/__tests__/guardrailObservability.test.ts` - PASS.
- `npm.cmd --workspace @aif/shared test -- --run src/__tests__/guardrailObservability.test.ts` after sanitizer hardening - PASS.
- `npm.cmd --workspace @aif/api test -- --run src/__tests__/tasks.test.ts -t "missing_aif_result_contract|return audit roadmap report tasks to rework|legacy failure signature matches|same failure"` after API prompt-contract hardening - PASS, 2 tests selected.
- `npm.cmd run build --workspace=@aif/api` after API prompt-contract hardening - PASS.
- `npm.cmd --workspace @aif/api test -- --run src/__tests__/tasks.test.ts -t "redacts secret-like file paths from operator rejection guardrail timeline summaries"` after final-review fix - PASS, 1 test selected.
- `npm.cmd run build --workspace=@aif/api` after final-review fix - PASS.
- Tester final rerun source check: `rg -n "recordTaskStageArtifactAttempt\\(|metadata:.*error|summary:.*error|summary:.*files=|metadata:.*files=|error.*metadata|error.*summary" packages/api/src/services/operatorVerifiedCompletion.ts` - PASS; no raw-error or `files=` summary/metadata matches.
- `npm.cmd --workspace @aif/agent test -- --run src/__tests__/coordinator.test.ts -t "exercises the typed audit batch lifecycle canary without live runtimes"` after same-failure branch fix - PASS, 1 test selected.
- `npm.cmd --workspace @aif/agent test -- --run src/__tests__/coordinator.test.ts -t "same_failure|runtime recovery|split_required|prompt contract|guardrail"` after same-failure branch fix - PASS, 1 test selected.
- `npm.cmd run build --workspace=@aif/agent` after same-failure branch fix - PASS.
- Tester same-failure branch source check: `rg -n -C 8 "SAME_FAILURE_FAIL_CLOSED|same_failure_fingerprint_fail_closed|recordAttempt|updateTaskStatus" packages/agent/src/coordinator.ts` - PASS; existing `blocked_external` update remains before the additive guardrail emission.
- Final reviewer focused commands all passed:
  - `npm.cmd --workspace @aif/shared test -- --run src/__tests__/guardrailObservability.test.ts`.
  - `npm.cmd --workspace @aif/data test -- --run src/__tests__/workflowTimeline.test.ts -t "guardrail|stage artifact gate"`.
  - `npm.cmd --workspace @aif/api test -- --run src/__tests__/tasks.test.ts -t "redacts secret-like file paths from operator rejection guardrail timeline summaries"`.
  - `npm.cmd --workspace @aif/agent test -- --run src/__tests__/coordinator.test.ts -t "exercises the typed audit batch lifecycle canary without live runtimes"`.
- Tester rerun command: `rg "PROMPT_CONTRACT_MISSING|agent_prompt_contract_missing_total" packages/api/src packages/agent/src packages/shared/src docs/configuration.md docs/rdpi/work/11_observability_and_metrics/result.md` - PASS; matches found in shared counter mapping, API task events, agent implementer, docs, and result.
- `npm.cmd --workspace @aif/data test -- --run src/__tests__/workflowTimeline.test.ts -t "guardrail|stage artifact gate"` - PASS.
- `npm.cmd --workspace @aif/agent test -- --run src/__tests__/subagentQuery.test.ts -t 'guardrail|repeated tool-loop|write path|repeated_tool_loop_blocked'` - PASS.
- `npm.cmd --workspace @aif/agent test -- --run src/__tests__/implementer.test.ts -t checklist` - PASS.
- `npm.cmd --workspace @aif/agent test -- --run src/__tests__/implementer.test.ts -t manifest` - PASS.
- `npm.cmd --workspace @aif/agent test -- --run src/__tests__/implementer.test.ts -t missing_aif_result_contract` - PASS with no matching tests selected.
- `npm.cmd --workspace @aif/agent test -- --run src/__tests__/coordinator.test.ts -t "same_failure|runtime recovery|split_required|prompt contract|guardrail"` - PASS.
- `npm.cmd --workspace @aif/api test -- --run src/__tests__/tasks.test.ts -t "allows unrelated dirty files outside declared task scope"` - PASS.
- `npm.cmd --workspace @aif/api test -- --run src/__tests__/tasks.test.ts -t "rejects unresolved blocking findings without an allowed override"` - PASS.
- `npm.cmd --workspace @aif/api test -- --run src/__tests__/tasks.test.ts -t "return audit roadmap report tasks to rework on recoverable approve_done failures"` - PASS.
- `npm.cmd --workspace @aif/runtime test -- --run src/__tests__/qwenLocalAgent.test.ts -t "stops immediately after a policy-violation tool result"` - PASS.
- `npm.cmd run build` - PASS.
- `npm.cmd run lint` - PASS with one unrelated existing warning in `packages/agent/src/subagents/reviewer.ts`.
- `npm.cmd test` - first attempt timed out at 180s and the tester stopped the orphaned process tree; rerun with a 600s timeout passed.

## Notes

- The earlier alternation filters `operator_verified_completion`, `same_failure`, and `write_path_not_allowed` selected no tests because nearby tests use human-readable titles; exact-title replacements are listed above.
- `guardrail_event` attempts intentionally add timeline diagnostics and do not satisfy research/design stage artifact gates.
- Pre-existing unrelated dirty files observed before implementation and left untouched: `docs/kb/windows-codex-bootstrap-validation.md`, `docs/memory/**`, and `docs/rdpi/work/04_aif_result_contract_and_output/result.md`.
- No commits were created.
