# Plan

## Plan Status

Ready for independent plan review.

## Implementation Plan

1. Add shared contracts.

- Add `packages/shared/src/aifResultContract.ts` with fenced-block extraction, JSON parse, validation, and issue codes.
- Add tests in `packages/shared/src/__tests__/aifResultContract.test.ts`.
- Export the helper from `packages/shared/src/index.ts`.

2. Harden runtime stage caps and repeated tool loop handling.

- Update `packages/shared/src/runtimeStagePolicy.ts` so planner, plan_checker, implementer, reviewer, qa, audit, and synthesis default to `repeatedToolCallLimit = 2`.
- Add or update `packages/shared/src/__tests__/runtimeStagePolicy.test.ts` expectations.
- Add a normalized Qwen tool-loop fingerprint helper in `packages/runtime/src/adapters/qwenLocalAgent/api.ts` or shared code if reuse is clean.
- Include workflow kind, tool name, cwd/target path, normalized args, and allowed write paths in the fingerprint.
- Implement special per-tool caps from the intake:
  - `git_commit`: max 1 successful or no-op attempt per artifact per run.
  - `finalize_audit_report_manifest`: max 2 per artifact per run.
  - `validate_audit_report`: max 2 per artifact per run, while preserving the existing validation fingerprint guard.
  - `git_status`: after a clean state, max 1 repeated clean check.
  - `read_file`: same normalized path plus range/offset may be repeated at most once.
  - `list_files`: same normalized path may be repeated at most once.
- On limit exceed, emit a structured `repeated_tool_loop_blocked` event and throw controlled `RuntimeExecutionError` instead of returning ordinary final output.
- Update `packages/runtime/src/__tests__/qwenLocalAgent.test.ts` repeated-loop canaries for repeated `read_file`, `list_files`, clean `git_status`, repeated `git_commit`, repeated `finalize_audit_report_manifest`, and repeated `validate_audit_report` in audit/synthesis/implementer-relevant stages.

3. Tighten write-path denial semantics.

- Preserve existing `allowedWritePaths` enforcement for `write_file`, `apply_patch`, and `git_commit`.
- Change denial text from generic outside-scope wording to deterministic `write_path_not_allowed: <path>` while preserving permission category.
- Treat write/edit surfaces as follows:
  - `write_file`: allow only paths matching `execution.allowedWritePaths`; deny generated/dependency directories and outside-scope paths.
  - `apply_patch`: extract every touched file from the patch and require each path to match `execution.allowedWritePaths`; reject symlink/executable/broad patch forms already guarded today.
  - edit-style tool aliases, if present in Qwen tools now or added later, must call the same path policy helper before writing.
  - `git_commit`: require explicit paths matching `execution.allowedWritePaths`; keep internal `git add -- <allowedPath>` only after scope validation.
  - `run_shell`: deny shell-equivalent write forms exposed through the structured command surface or future allowlist, including `git add .`, `git add -A`, `rm -rf`, `find ... -delete`, `sed -i`, and repository-mutating scripts unless every declared target path matches `execution.allowedWritePaths`.
  - package-manager verification scripts remain allowed only as verification commands; package-manager commands that hydrate dependencies remain limited to the existing safe dependency-hydration path and must not bypass source write policy.
- Add shell/write denial tests for broad write commands, denied source edit attempts in audit/report scope, `git add .`/`git add -A`, and allowed explicit path commit/write cases.
- Keep verification/package-manager commands allowed when they are read-only or test/build commands.

4. Harden implementer checklist and manifest evidence.

- In `packages/agent/src/subagents/implementer.ts`, after checklist auto-sync, if `parsedTaskCount > 0 && pendingTaskCount > 0`, persist:
  - `status = "blocked_external"`
  - `blockedReason = "implementation_checklist_incomplete: <N> pending checklist item(s)"`
  - `blockedFromStatus = "implementing"`
  - `retryAfter = null`
  - `manualReviewRequired = false`
  - `reworkRequested = true`
- Do not clear `reworkRequested` in that path.
- Change deterministic implementation manifest fallback so `!validation.ok` returns `null`; log normalized JSON only as diagnostics.
- Update implementer tests for checklist block and invalid deterministic manifest rejection.

5. Enforce compact rework result contract.

- Require valid `aif-result` for `task.reworkRequested` implementer outputs before accepting rework completion.
- Block missing/invalid contract with `missing_aif_result_contract`.
- Block unresolved blockers and completed status without verification evidence using deterministic issue codes.
- Keep clean first-run legacy behavior only where no rework is active.

6. Queue follow-up intake cards for non-implemented P1/P2 scope.

- Create intake artifacts only, not execution artifacts, for:
  - strict planner `aif-planning-decision` state and split-required non-runnability;
  - same-failure fingerprint fail-closed and artifact-delta recovery gating;
  - audit/report prompt cleanup and validator issue-code cleanup;
  - config-driven ReviewGate refutations;
  - observability counters/events aggregation.
- Add matching entries to `docs/intake/work_status.json` and `docs/intake/work_index.md` without reformatting unrelated entries.

7. Verification and closeout.

- Run focused package tests.
- Run `npm.cmd run lint`, `npm.cmd test`, and `npm.cmd run build`.
- If failures are unrelated and pre-existing, document exact output in `result.md`.
- After independent `TEST PASS` and `REVIEW PASS`, write `result.md`, run memsync auto, and update only this task entry in `docs/intake/work_status.json` to `done`.

## Acceptance Criteria Mapping

- P0-1 tool-loop guard: steps 2 and focused runtime tests.
- P0-2 checklist hard stop: step 4 and implementer tests.
- P0-3 invalid manifest fallback rejection: step 4 and implementer/shared evidence tests.
- P0-4 compact rework contract: steps 1 and 5.
- P0-5 allowed write paths: step 3 and runtime tests.
- P1/P2: step 6 queues explicit follow-up cards with preserved acceptance criteria where not implemented here.

## Gate Requirements

- Independent `PLAN PASS` is required before file edits beyond RDPI artifacts.
- Independent `TEST PASS` is required after implementation and verification.
- Independent `REVIEW PASS` is required before closeout.
- If any gate fails, revise the relevant artifacts or implementation and rerun the invalidated gate.
