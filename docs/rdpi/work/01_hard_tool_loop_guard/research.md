# Research - 01_hard_tool_loop_guard

## Task framing and lane

- Task ID: `01_hard_tool_loop_guard`.
- Lane: `work`.
- Source task: `C:/Users/apron/Desktop/aif_stabilization_tz_pack/01_hard_tool_loop_guard.md`.
- Priority: P0.
- Goal: enforce a runtime/tool-level guard that stops repeated tool-loop behavior before it turns into an expensive agent cycle.
- RDPI boundary: before `PLAN PASS`, this research is planning-only. No live endpoint checks, scheduler reads, worker-report inspection, log probing, runtime service checks, canary execution, or shared-memory recall were performed.

## Accepted planning sources or local facts

- Repository instructions: `AGENTS.md` requires Node commands through `npm.cmd`, RDPI artifacts under `docs/rdpi/`, and local repo facts before memory.
- Required RDPI preflight: `python "$env:USERPROFILE\.codex\tools\codex-ensure-rdpi.py"` returned `STATUS: ready`.
- Local worktree state: branch `codex/roadmap-audit-oom-hardening`; one pre-existing unrelated dirty file, `docs/kb/windows-codex-bootstrap-validation.md`, must remain untouched.
- Task file expected zones:
  - `packages/runtime/src/adapters/qwenLocalAgent/api.ts`
  - `packages/runtime/src/adapters/qwenLocalAgent/tools.ts`
  - `packages/shared/src/runtimeStagePolicy.ts`
  - `packages/runtime/src/__tests__/qwenLocalAgent.test.ts`
  - `packages/shared/src/__tests__/runtimeStagePolicy.test.ts`
- `packages/shared/src/runtimeStagePolicy.ts` already defines `repeatedToolCallLimit: 2` for `planner`, `plan_checker`, `implementer`, `reviewer`, `qa`, `audit`, and `synthesis`.
- `packages/shared/src/__tests__/runtimeStagePolicy.test.ts` already asserts repeated-call defaults for those stages.
- `packages/agent/src/subagentQuery.ts` applies runtime stage caps to adapter options, including `repeatedToolCallLimit`.
- `packages/runtime/src/adapters/qwenLocalAgent/api.ts` already has a qwen-local-agent repeated-tool guard:
  - special tool limits for `read_file`, `list_files`, `git_status`, `git_commit`, `finalize_audit_report_manifest`, and `validate_audit_report`;
  - normalized fingerprint construction;
  - blocking before `executeQwenLocalTool`, so a blocked repeated call is not physically executed.
- `packages/runtime/src/__tests__/qwenLocalAgent.test.ts` already covers repeated loops for `read_file`, `list_files`, `git_status`, `git_commit`, `run_shell`, `finalize_audit_report_manifest`, and `validate_audit_report`.
- `packages/agent/src/stageErrorHandler.ts` currently treats a repeated-tool-loop permission error like a generic runtime permission/operator-input issue. That does not satisfy the requested task-level fail-closed reason contract.
- `packages/agent/src/subagentQuery.ts` persists normal tool activity through `onToolUse`, but the `onEvent` bridge does not appear to persist `repeated_tool_loop_blocked` as the requested activity-log line.

## Explorer findings

Independent explorer returned the same core findings:

- Stage defaults are present for the required stages.
- The qwen-local-agent tool loop blocks before execution on limit breach.
- Current fingerprint payload is a normalized object stringified for counting, not a `sha256(...)` hash as requested.
- Current fingerprint input includes `workflowKind` but not an explicit separate `stage`.
- `repeated_tool_loop_blocked` exists as a runtime event, but durable activity logging for the requested line format is missing.
- Scope is qwen-specific; if "all runtime adapters" is required, Codex/Claude/native tool loops are not covered by the qwen adapter.

## Same-project memory

- Not queried before `PLAN PASS` because the RDPI contract forbids shared-memory recall before plan approval unless explicitly waived.

## Cross-project reusable patterns

- Not queried before `PLAN PASS` for the same reason.

## Rejected or stale memory candidates

- None evaluated. Memory lookup is intentionally deferred until after `PLAN PASS` or an explicit user waiver.

## Planning implications

- The implementation should be a targeted hardening of the existing qwen-local-agent guard, not a rewrite.
- The task phrase "all runtime stages" should be interpreted as all AIF workflow stages that use the AIF-owned qwen-local-agent tool loop, because the expected task zones are qwen-local-agent and shared stage policy files.
- A universal guard for all runtime adapters is out of scope for this task unless a later plan review or user instruction expands scope; external adapters may not expose a pre-execution tool interception point that AIF can use to physically block provider-side tool calls.
- Acceptance needs extra work around:
  - hashed tool fingerprints;
  - explicit stage in fingerprint/event data;
  - blocked reason formatting;
  - durable activity-log persistence for blocked loop events;
  - tests that prove the blocked attempt is not executed.
