# Research

## Task framing and lane

- Task: `03b_coordinator_invalid_manifest_rework_integration`.
- Lane: `work`.
- Source brief: `C:\Users\apron\Desktop\03b_coordinator_invalid_manifest_rework_integration.md`.
- User instruction: execute the follow-up RDPI task for coordinator integration gaps found after review of `03_invalid_manifest_fallback_fail_closed`.
- Goal: preserve implementer-owned below-cap invalid implementation manifest rework state in coordinator, so the same poll cycle does not continue into review handoff and convert the task to manual review.

## Accepted planning sources or local facts

- RDPI preflight command `python "$env:USERPROFILE\.codex\tools\codex-ensure-rdpi.py"` returned `STATUS: ready`.
- Current branch at research time: `codex/roadmap-audit-oom-hardening`.
- Existing dirty file outside this task: `docs/kb/windows-codex-bootstrap-validation.md`; it must be left untouched.
- `packages/agent/src/coordinator.ts:225` defines the implementer stage from `plan_ready` or `implementing`, in-progress `implementing`, on-success `review`.
- `packages/agent/src/coordinator.ts:3519` runs the stage runner, then `packages/agent/src/coordinator.ts:3523` reloads `latestTask`.
- `packages/agent/src/coordinator.ts:3532` short-circuits `needs_input`.
- `packages/agent/src/coordinator.ts:3555` limits generic runner-owned status preservation to requirements/research/design/qa; implementer is not included.
- `packages/agent/src/coordinator.ts:3608` already preserves implementer terminalization when `latestTask.status === "blocked_external"`.
- `packages/agent/src/coordinator.ts:3946` runs the implementer review-handoff completion evidence guard before the success transition to `review`.
- `packages/agent/src/coordinator.ts:2802` defines coordinator-owned implementation evidence rework issue codes and intentionally does not include `missing_implementation_manifest`.
- `packages/agent/src/coordinator.ts:2837` only returns implementation evidence to coordinator-owned rework during `phase === "review_handoff"`.
- `packages/agent/src/__tests__/coordinator.test.ts:67` and `:70` mock `runImplementer` and `runReviewer`.
- `packages/agent/src/__tests__/coordinator.test.ts:1195` has the legacy implementer-to-review happy path.
- `packages/agent/src/__tests__/coordinator.test.ts:6680` has the closest existing implementer terminalization preservation test.
- Previous RDPI result `docs/rdpi/work/03_invalid_manifest_fallback_fail_closed/result.md` records the implementer fail-closed contract:
  - below cap: `status="implementing"`, `reworkRequested=true`, `manualReviewRequired=false`, incremented `retryCount`, `blockedReason="implementation_manifest_invalid: <issueCodes>"`;
  - after cap: `status="blocked_external"`, `manualReviewRequired=true`, `reworkRequested=false`, `blockedReason="implementation_manifest_invalid_after_rework_limit: <issueCodes>"`;
  - stale accepted `implementationManifestJson` is cleared.

## Same-project memory

- Local memory delta `docs/memory/tasks/work/03_invalid_manifest_fallback_fail_closed-delta.md` confirms the same invalid-manifest policy and issue-code blockedReason format.
- Local memory decision `docs/memory/decisions/decision-cbd0d945b859ef77.md` records using `implementation_manifest_invalid: <issueCodes>` for below-cap manifest rework.
- Local memory decision `docs/memory/decisions/decision-f35d4c89792a7a8a.md` records using `implementation_manifest_invalid_after_rework_limit: <issueCodes>` for after-cap manual review.
- No shared-memory recall was performed before `PLAN PASS` because the RDPI boundary forbids shared-memory recall before plan approval unless explicitly waived.

## Cross-project reusable patterns

- Local reusable pattern `docs/memory/patterns/pattern-14df6d4aef398f3d.md` says not to let a generic completion-evidence repair path override a higher-priority handoff decision. This applies directly: coordinator review-handoff evidence must not override implementer-owned invalid-manifest self-rework state.

## Rejected or stale memory candidates

- Broader completion evidence guard memories about hallucinated zero-delta verification are background only. The current task is not to change validation or coordinator rework issue sets.
- The proposed non-fix `IMPLEMENTATION_EVIDENCE_REWORK_ISSUES.add("missing_implementation_manifest")` is rejected by the task brief because it can double-increment retry state and still fail to preserve implementer-owned fields.
- Deterministic implementation manifest fallback is rejected as stale behavior by the completed `03_invalid_manifest_fallback_fail_closed` result.

## Research conclusion

The coordinator needs a narrow implementer-only short-circuit after runner completion and after `needs_input`, while leaving the existing `blocked_external` terminal branch authoritative. The guard must recognize only below-cap implementer invalid-manifest self-rework:

- `status === "implementing"`;
- `reworkRequested === true`;
- `manualReviewRequired !== true`;
- `blockedReason` starts with `implementation_manifest_invalid:`;
- `implementationManifestJson == null`.

It must return `false` before skip-review, review-handoff completion evidence, and success reset paths.
