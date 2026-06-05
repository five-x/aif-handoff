# Result

## Outcome summary

- Implemented terminal operator closeout idempotency.
  - Repeating the same operator evidence on a `done` task returns the current task unchanged.
  - Repeating different evidence on a `done` task rejects with `operator_verified_completion rejected: reason=already_done_evidence_mismatch`.
  - The idempotent route response skips `task:moved`, `task:timeline_updated`, and `task:trust_updated` broadcasts because no lifecycle or artifact state changed.
- Updated generic artifact trust rollup selection.
  - Terminal `done`/`verified` task cards now prefer accepted `operator_verified_completion` evidence, then accepted/trusted `implementation_manifest`, then other trusted accepted evidence when it will not hide an invalid implementation manifest.
  - Timeline generation still includes thin plan artifacts and all stage artifacts.
- Added focused API/data regressions for idempotent retry, mismatched retry, card-level terminal evidence priority, timeline preservation, and invalid implementation manifest visibility.

## Gate verdicts

- Plan review: `PLAN PASS`.
- Test gate: `TEST PASS`.
- Final review: `REVIEW PASS`.
- User waivers: none.
- Role skips: none.
- Memsync: completed with local artifact generation and shared-memory ingestion.

## Verification

- `npm.cmd --workspace @aif/api test -- --run src/__tests__/tasks.test.ts -t "operator closeout|operator evidence|done task"`: passed, `11 passed | 194 skipped`.
- `npm.cmd --workspace @aif/data test -- --run src/__tests__/index.test.ts -t "artifact trust rollups|operator accepted evidence|terminal|invalid implementation manifests"`: passed, `13 passed | 198 skipped`.
- `npm.cmd run lint`: passed, `10 successful`; retained one pre-existing warning in `packages/agent/src/subagents/reviewer.ts:1462:9`.
- `npm.cmd run build`: passed, `7 successful`.

## Readback examples

- Before behavior represented by regression fixture:
  - A terminal feature task with an invalid/thin `plan_manifest` and accepted terminal implementation/operator evidence could select the rejected/missing plan manifest for card-level trust, producing an untrusted card despite trusted terminal evidence in the timeline.
  - A repeated operator closeout on a manually completed `done` task could run the normal closeout path again, add another accepted stage artifact attempt, and for non-`skipReview` tasks compute `nextStatus=review`.
- After behavior from focused readbacks:
  - `operator-idempotent-done-task` retry response remains `status: "done"` and the accepted `operator_verified_completion/test_result` attempt count is unchanged.
  - `operator-mismatch-done-task` retry response is `409` with `already_done_evidence_mismatch`, and subsequent task detail still reports `status: "done"`.
  - Terminal generic rollup fixtures now return trusted card summaries for accepted terminal evidence:
    - `artifactRole: "implementation_manifest"`, `artifactTrustLevel: "trusted"`, `claimOutcome: "supported"`, `nextAction: "none"` when implementation evidence is accepted.
    - `artifactRole: "test_result"`, `artifactTrustLevel: "trusted"`, `claimOutcome: "supported"`, `nextAction: "none"` when accepted operator closeout evidence is strongest.
  - Timeline assertions still find the thin `plan_manifest` artifact alongside the accepted terminal artifact.

## Stable facts

- Operator closeout retries on `done` tasks are now governed by a stable evidence fingerprint, excluding volatile fields such as acceptance time and output preview.
- Generic task timeline completeness is separate from card-level trust selection; cards summarize strongest relevant terminal evidence while timelines preserve all artifacts.

## Memory sync

- Command: `python "$env:USERPROFILE\.codex\tools\codex-memsync.py" --repo . --mode auto --lane work --task-id 12_operator_closeout_idempotency_and_trust_rollup --project aif-handoff --entity aif-handoff`
- Output included remembered facts for terminal operator closeout fingerprints and timeline/card trust separation, plus ingested decision and pattern documents.

## Reusable patterns

- For terminal idempotency, compare stable evidence fields and return a no-op result before mutation.
- For user-facing trust cards, prefer current terminal evidence while keeping historical or lower-priority artifacts in timeline/readback views.
