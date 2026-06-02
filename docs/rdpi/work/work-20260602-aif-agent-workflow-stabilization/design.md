# Design

## Scope Boundaries

This run will implement the P0 hardening items and queue P1/P2 items that would otherwise broaden the change across planner state, review-gate configuration, recovery orchestration, and observability infrastructure.

In scope for implementation:

- Stage default repeated tool caps for the required runtime stages.
- Qwen hard repeated tool-loop guard with normalized fingerprints, structured event data, and controlled runtime failure.
- Tool-level write-path enforcement improvements for Qwen shell/write denial messages.
- Implementer hard stop when checklist remains pending after sync.
- Invalid deterministic implementation manifest fallback rejection.
- Shared compact `aif-result` parser/validator and rework gate enforcement.
- Tests for the P0 canaries.
- Follow-up intake cards for P1/P2 items not implemented in this run, preserving acceptance criteria.

Out of scope for implementation in this same run:

- Full planner split state refactor.
- Full same-failure fingerprint and artifact-delta recovery refactor across coordinator/review gates.
- ReviewGate config-provider extraction.
- Full observability counter backend.
- Full architecture rewrite, model/provider replacement, UI changes, or business semantics changes.

## Design Choices

1. Add small shared contract helpers instead of growing prompts.

   New shared helpers should be colocated with existing contract helpers under `packages/shared/src`. Runtime code will use a tool-loop fingerprint helper; implementer code will use an `aif-result` parser/validator. This keeps enforcement in code and makes tests independent of prompt wording.

2. Convert repeated tool loops from model-visible suppression into runtime-controlled failure.

   Qwen currently sends a suppressed tool result back to the model, then may return ordinary output text. The new guard should block execution before the repeated tool runs, emit a `repeated_tool_loop_blocked` event with fingerprint/count/limit/workflowKind/toolName, and throw `RuntimeExecutionError` with provider metadata. The coordinator can then treat it as a runtime failure instead of another prompt loop.

3. Keep allowed write-path enforcement at the tool layer.

   Existing direct write tools already enforce `allowedWritePaths`. The implementation should preserve those checks and make denial output deterministic (`write_path_not_allowed: <path>`). Shell command support is already structured; add explicit denial for broad write forms such as `git add .`, `git add -A`, destructive delete patterns, and mutation commands outside allowed paths where the structured command surface exposes them.

4. Make implementer evidence fail closed.

   Checklist drift and invalid manifest fallback are downstream evidence problems. The implementer should persist a blocked task state with deterministic reasons instead of clearing `reworkRequested` and letting review handoff decide.

5. Make rework output machine-readable.

   Add a shared `aif-result` fenced JSON parser. For rework attempts, missing/invalid `aif-result`, unresolved blockers, or completed status without verification evidence should block handoff. Clean first-run output may keep legacy manifest behavior for compatibility.

6. Queue broad P1/P2 work as intake cards.

   The selected task permits P1/P2 hardening to be split into explicit follow-up intake cards. Those cards should remain intake artifacts only and must not be executed in this run.

## Open Questions And Assumptions

- Assumption: P0 implementation plus explicit P1/P2 follow-up cards satisfies the intake scope where P1/P2 are too broad for one safe patch.
- Assumption: Runtime event counters can be represented initially as structured events; full counter aggregation belongs to a P2 follow-up unless already trivial to wire.
- Assumption: The Qwen local runtime tests are the right integration layer for tool-loop and write-path canaries because they exercise tool execution rather than prompt text.

## Proposed Verification

Focused tests first:

- `npm.cmd test --workspace=@aif/shared -- --run src/__tests__/runtimeStagePolicy.test.ts src/__tests__/aifResultContract.test.ts`
- `npm.cmd test --workspace=@aif/runtime -- --run src/__tests__/qwenLocalAgent.test.ts`
- `npm.cmd test --workspace=@aif/agent -- --run src/__tests__/implementer.test.ts`

Full repo checks after focused tests:

- `npm.cmd run lint`
- `npm.cmd test`
- `npm.cmd run build`

Required evidence:

- Repeated identical `read_file` blocks by runtime guard, not prompt text.
- Pending checklist after auto-sync leaves task `blocked_external` with `implementation_checklist_incomplete`.
- Invalid deterministic manifest with normalized JSON is not persisted as `implementationManifestJson`.
- Rework output without valid `aif-result` blocks handoff.
- Denied write path returns explicit `write_path_not_allowed`.
- Follow-up intake cards exist for non-implemented P1/P2 items with acceptance criteria preserved.
