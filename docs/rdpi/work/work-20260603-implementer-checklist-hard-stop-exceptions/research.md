# Research

## Task framing and lane

- Task id: `work-20260603-implementer-checklist-hard-stop-exceptions`.
- Lane: `work`.
- Source request: `C:\Users\apron\Desktop\aif_stabilization_tz_pack\02_implementer_checklist_hard_stop.md`.
- Priority: P0.
- Required behavior: after implementer auto-sync, a parsed plan checklist with pending items must block before `review`, `qa`, or `done` unless a valid manifest explicitly proves the pending items were superseded, cancelled, or waived with evidence.

## Accepted planning sources or local facts

- RDPI preflight command completed with `STATUS: ready` for this repository.
- `AGENTS.md` requires RDPI gates, local repo facts before memory, and independent `PLAN PASS`, `TEST PASS`, and `REVIEW PASS` gates for non-trivial work.
- The current implementer already performs a hard stop after checklist auto-sync:
  - `packages/agent/src/subagents/implementer.ts:6243` computes `checklistAfterSync`.
  - `packages/agent/src/subagents/implementer.ts:6245` detects `parsedTaskCount > 0 && pendingTaskCount > 0`.
  - `packages/agent/src/subagents/implementer.ts:6285` builds `implementation_checklist_incomplete: <N> pending checklist item(s)`.
  - `packages/agent/src/subagents/implementer.ts:6286` persists `status: "blocked_external"`, `blockedFromStatus: "implementing"`, `retryAfter: null`, `manualReviewRequired: false`, and `reworkRequested: true`.
- The coordinator will not advance to review when the implementer terminalizes first:
  - `packages/agent/src/coordinator.ts:3947` runs completion evidence guard before implementer review handoff.
  - `packages/agent/src/coordinator.ts:3984` transitions to the next stage only after the earlier gates return.
  - Explorer found the coordinator has an earlier branch that returns when the implementer has already terminalized the task before review handoff.
- Existing tests cover the base hard stop:
  - `packages/agent/src/__tests__/implementer.test.ts:5782` tests pending checkboxes after auto-sync.
  - `packages/agent/src/__tests__/implementer.test.ts:5803` asserts `blocked_external`.
  - `packages/agent/src/__tests__/implementer.test.ts:5804` asserts the deterministic blocked reason.
  - `packages/agent/src/__tests__/implementer.test.ts:5807` through `packages/agent/src/__tests__/implementer.test.ts:5809` assert `blockedFromStatus`, `manualReviewRequired`, and `reworkRequested`.
- The current manifest checklist contract is too small for the requested exception:
  - `packages/shared/src/implementationManifest.ts:51` defines `ImplementationManifestPlanChecklist`.
  - `packages/shared/src/implementationManifest.ts:56` supports only `pendingItems`.
  - `packages/shared/src/implementationManifest.ts:583` normalizes checklist counts and `pendingItems`.
  - `packages/shared/src/implementationManifest.ts:1100` validates only count consistency and requires `pending === 0`.
- Acceptance-criterion waivers already require explicit authority and evidence refs:
  - `packages/shared/src/implementationManifest.ts:1075` handles `status === "waived"`.
  - `packages/shared/src/implementationManifest.ts:1078` through `packages/shared/src/implementationManifest.ts:1080` require authority and allowed evidence refs.
- Prior local RDPI/intake sources show this hard stop was previously implemented as part of a broader stabilization task:
  - `docs/intake/work/work-20260602-aif-agent-workflow-stabilization.md:42` records the base P0-2 hard stop.
  - `docs/rdpi/work/work-20260602-aif-agent-workflow-stabilization/result.md` records that pending plan checklist after sync blocks as `implementation_checklist_incomplete`.
- A later local design note already names the missing exception shape:
  - `docs/rdpi/work/work-20260602-aif-agent-workflow-stabilization-v2-closeout/design.md:72` says pending checklist items require explicit superseded/cancelled validated evidence.
  - `docs/rdpi/work/work-20260602-aif-agent-workflow-stabilization-v2-closeout/design.md:123` lists rejection of pending checklist items unless validated superseded/cancelled evidence exists.

## Same-project memory

- No shared-memory recall was performed before `PLAN PASS`, per RDPI boundary.
- Same-project memory may be useful after `PLAN PASS` only if implementation uncovers a conflict with local docs, but local code and RDPI history already identify the current gap.

## Cross-project reusable patterns

- No cross-project shared-memory recall was performed before `PLAN PASS`.
- Reusable planning pattern from local instructions: fail-closed gates should accept exceptions only when the exception is represented as structured, reviewable evidence.

## Rejected or stale memory candidates

- The prior broad stabilization result is accepted only for the base hard stop. It is not sufficient for this task because the external checklist requires a valid superseded/cancelled/waived exception path that the current manifest contract cannot represent.
- The existing acceptance-criteria waiver model is not stale, but it is not sufficient by itself because checklist items are a separate manifest surface.

## Open questions

- Exact field names for checklist dispositions are not established in code. Proposed names for design review: `supersededItems`, `cancelledItems`, and `waivedItems`.
- The checklist item matching strategy should be strict enough to avoid accidental bypass. Proposed approach: require each disposition `item` to exactly match a pending checklist item after checkbox text normalization.

## Hypotheses

- Adding structured checklist disposition fields to the implementation manifest and validating them against actual pending plan checklist text will satisfy the requested exception without weakening the hard stop.
- The implementer can safely inspect a valid extracted manifest before blocking pending checklist items, but must continue to block when the manifest is absent, invalid, incomplete, or does not cover every pending item.
- Shared validator coverage in `implementationManifest.ts` plus implementer and coordinator tests will prevent review handoff bypasses.
