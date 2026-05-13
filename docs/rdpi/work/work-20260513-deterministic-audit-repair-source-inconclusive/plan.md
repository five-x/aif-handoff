# Plan - Deterministic Audit Repair Emits Source Inconclusive

## Plan review state

Pending independent `PLAN PASS` or `PLAN FAIL`.

## Steps

1. Add deterministic repair input parsing in `packages/agent/src/subagents/implementer.ts`.
   - Parse `Risk hypotheses:` entries and `risk-*` IDs from the task description.
   - Reuse or extend existing scope parsing without falling back to `.`.
   - Track why repair is trusted or inconclusive.
   - Define a single trusted-repair predicate that requires concrete product scope, parsed risk hypotheses, and bound substantive evidence for every risk hypothesis.

2. Harden repair evidence file selection.
   - Add hidden tooling directories to repair traversal exclusions for broad scope: `.agents`, `.ai-factory`, `.claude`, `.codex`, `.github`, and similar runtime metadata roots.
   - Permit those roots only when explicitly present in parsed scope.
   - Ensure broad or missing scope does not select arbitrary first files under the repository root.
   - Replace generic `git grep -n -m 5 "."` as trusted no-findings proof with risk-specific inspection commands derived from parsed risk hypothesis terms, or classify the repair as `source_inconclusive`.

3. Make deterministic report manifest outcome explicit.
   - Change `buildAuditReportManifest()` to accept a repair outcome instead of hard-coding `validated_no_findings`.
   - Include parsed risk hypotheses in trusted manifests.
   - Emit `source_inconclusive` with no trusted no-findings claim when risk, scope, or product evidence prerequisites are not met.
   - Bind evidence refs to risk hypotheses in the manifest only when the trusted-repair predicate passes; generic scoped evidence must not create trusted no-findings claims.

4. Persist non-trusted artifact lifecycle state.
   - Update the deterministic repair run path so inconclusive repair calls `updateRoadmapBatchArtifactState()` when a roadmap artifact exists.
   - Persist `state: "source_inconclusive"`, `classification: "source_inconclusive"`, relevant validation details, content SHA, source snapshot ID if available, and current project root.
   - Preserve existing attempt/history behavior and avoid marking source-inconclusive reports as trusted valid.
   - Make task-row semantics explicit: trusted repairs clear `reworkRequested`; source-inconclusive repairs clear `reworkRequested` only as terminal non-trusted lifecycle handling and must log that distinction.

5. Update implementer tests.
   - Update existing deterministic repair tests to include explicit risk hypotheses when they expect trusted no-findings, or change expectations to source inconclusive where evidence is insufficient.
   - Add a regression where the first tracked text files live under `.agents/**` and the task has broad or missing scope; assert deterministic repair does not produce `validated_no_findings`.
   - Add a regression with explicit product scope and risk IDs but only generic/non-risk-specific evidence; assert deterministic repair emits `source_inconclusive`.
   - Assert the repaired report manifest outcome is `source_inconclusive` and the roadmap artifact does not increment trusted valid counts.
   - Assert source-inconclusive repair preserves attempt history, records source-inconclusive classification, and has the intended `reworkRequested` terminal-handling state.
   - Add a positive compatibility fixture for explicit product scope plus risk hypotheses if needed to prove safe deterministic repair still works.

6. Run focused verification.
   - `npm.cmd test --workspace=@aif/agent -- src/__tests__/implementer.test.ts`
   - `npm.cmd test --workspace=@aif/data -- src/__tests__/index.test.ts` if artifact counting or state behavior changes require coverage.
   - `npm.cmd test --workspace=@aif/shared -- src/__tests__/auditReportValidator.test.ts src/__tests__/auditRoadmapContract.test.ts` if shared validation or manifest vocabulary is changed.
   - `npm.cmd run build --workspace=@aif/agent`
   - `npm.cmd run lint --workspace=@aif/agent`
   - Additional build/lint for shared/data only if those packages are changed.
   - `git diff --check`

7. Write `docs/rdpi/work/work-20260513-deterministic-audit-repair-source-inconclusive/result.md`.
   - Record implementation summary, touched files, verification commands, and gate outcomes.
   - Record any skipped checks explicitly.

8. Run memory sync after `TEST PASS` and `REVIEW PASS`.
   - `python "$env:USERPROFILE\.codex\tools\codex-memsync.py" --repo . --mode auto --lane work --task-id work-20260513-deterministic-audit-repair-source-inconclusive --project aif-handoff --entity aif-handoff`
   - Treat local review failure as blocking.
   - Treat shared-memory publish failure as a warning if local review artifacts succeed.

9. Update intake status only after successful RDPI close-out and local memory review.
   - Update only the matching entry in `docs/intake/work_status.json`.
   - Set the selected task status to `done`, keep the RDPI path, and set `updated` to `2026-05-13`.

## Acceptance mapping

- `runDeterministicAuditReportRepair` no longer writes unconditional `validated_no_findings`: steps 1 and 3.
- Deterministic repair does not upgrade insufficient evidence to trusted no-findings: steps 1, 3, 4, and 5.
- Broad scope fallback does not select arbitrary first files: step 2.
- Hidden agent/tooling files cannot satisfy product no-findings evidence unless explicitly scoped: step 2 and regression tests.
- Insufficient repaired reports transition to non-trusted lifecycle state and do not increment trusted valid counts: steps 4 and 5.
- Tests cover a repo where first text files are `.agents/**`: step 5.

## Gate requirements

- Independent `PLAN PASS` is required before implementation.
- Independent `TEST PASS` is required after implementation.
- Independent `REVIEW PASS` is required after testing.
- If any gate fails, revise the invalidated artifacts or code and rerun the gate.
