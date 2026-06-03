# Plan: 01b_nonconsecutive_signature_limit_tools

## Gate status

- Explorer: completed, read-only findings accepted into `research.md`.
- Plan review: pending.
- Implementation: pending `PLAN PASS`.
- Tester: pending implementation.
- Final review: pending `TEST PASS`.

## Implementation steps after PLAN PASS

1. Update `packages/runtime/src/adapters/qwenLocalAgent/api.ts`.
   - Add `NONCONSECUTIVE_SIGNATURE_LIMIT_TOOLS`.
   - Route nonconsecutive signature suppression through the new set.
   - Keep consecutive suppression for all tools.
   - Add per-run `gitStatusResultFingerprintCounts`.
   - Add helpers for normalized `git_status` output and result fingerprinting.
   - Add state-aware `git_status` suppression metadata.
   - Preserve current state-sensitive fingerprinting for `git_commit`, `finalize_audit_report_manifest`, and `validate_audit_report`.

2. Update `packages/runtime/src/__tests__/qwenLocalAgent.test.ts`.
   - Add the six required tests from the task spec.
   - Reuse existing mock/fetch/event helpers where possible.
   - Assert blocked calls do not emit `tool:result`.
   - Assert event metadata includes `signatureCount`, `nonconsecutive`, `fingerprint`, `fingerprintInput`, and `targetPath` where relevant.
   - Keep the existing git-commit artifact-delta regression passing.

3. Run targeted verification.
   - `npm.cmd --workspace @aif/runtime test -- --run src/__tests__/qwenLocalAgent.test.ts`

4. Run full verification.
   - `npm.cmd test`
   - If blocked or impractical, record the exact reason and any partial result in `result.md`.

5. Run independent tester gate.
   - Provide the task spec, changed files, and verification plan.
   - Require explicit `TEST PASS` or `TEST FAIL`.

6. Fix any tester failures, then rerun invalidated checks.

7. Run independent final reviewer gate.
   - Provide task spec, RDPI artifacts, diff summary, and test outcomes.
   - Require explicit `REVIEW PASS` or `REVIEW FAIL`.

8. Write `docs/rdpi/work/01b_nonconsecutive_signature_limit_tools/result.md`.
   - Include task id, commit field, files changed, tests run, canary run.
   - Include the required case table.
   - Include gate verdicts.
   - State whether any blocked call emitted `tool:result`.
   - State whether provider fallback/retry was triggered by `repeated_tool_loop_blocked`.

9. Run memsync after successful gates.
   - `python "$env:USERPROFILE\.codex\tools\codex-memsync.py" --repo . --mode auto --lane work --task-id 01b_nonconsecutive_signature_limit_tools --project aif-handoff --entity aif-handoff`

10. Stop before commit or push unless the user explicitly requests it.

## Acceptance checks

| Case                                   | Expected                                                |
| -------------------------------------- | ------------------------------------------------------- |
| interleaved `read_file`                | blocked by signature count                              |
| strict interleaved `read_file` limit 1 | second repeated signature blocked                       |
| interleaved `list_files`               | blocked by signature count                              |
| interleaved `search_files`             | blocked by signature count                              |
| stable `git_status`                    | blocked by state-aware repeated result                  |
| `git_status` after real delta          | allowed                                                 |
| git commit after artifact delta        | allowed after content repair, blocked on no-delta retry |

## Stop conditions

- Stop if plan reviewer returns `PLAN FAIL`; revise planning artifacts and rerun review.
- Stop if mandatory subagent tooling is unavailable; mark blocked instead of synthesizing a local pass.
- Stop if implementation requires touching unrelated dirty files.
