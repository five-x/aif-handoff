# Research

## Task Framing And Lane

- Task id: `work-20260602-aif-agent-workflow-stabilization-v2-closeout`.
- Lane: `work`.
- Input: `C:\Users\apron\Desktop\aif_agent_workflow_stabilization_tz_v2_with_closeout.md`.
- Requested workflow: `$rdpi`.
- Scope selected for this RDPI cycle: the new P0 closeout additions in the v2 TЗ, especially sections 18-20 and updated DoD section 22. The earlier broad hardening scope is already implemented in the current branch and should not be duplicated.

## Accepted Planning Sources Or Local Facts

- RDPI preflight command returned `STATUS: ready`, so the managed RDPI files are current for this repository.
- The TЗ explicitly adds a new P0 "operator verified completion" closeout path for already committed and manually verified implementation work, with endpoint/service requirements and positive/negative tests.
- The TЗ requires a completion-evidence hierarchy: valid implementation manifest, valid `aif-result`, operator verified completion evidence, then deterministic recovery manifest only if validation passes.
- The TЗ requires clean committed worktree support in implementation-manifest validation, including `dirtyChangedFiles`, `committedFiles`, `headCommitFiles`, and branch diff from base.
- Existing RDPI result for `work-20260602-aif-agent-workflow-stabilization` records that base P0 hardening was completed: repeated tool-loop guard, checklist hard stop, invalid deterministic manifest rejection, `aif-result` validation, and allowed write path enforcement.
- Existing server E2E result records the remaining closeout gap: the API smoke artifact was completed, committed, and verified, but the task card remained `blocked_external` after `aif-result`/implementation-manifest closeout failures.
- `packages/shared/src/taskCompletionEvidence.ts` collects changed files from git status plus base-branch/HEAD diff. It already exposes `changedFiles`, `dirtyChangedFiles`, `committedFiles`, and `meaningfulChangedFiles`.
- `packages/shared/src/implementationManifest.ts` currently validates manifest `changedFiles` by exact equality with `input.meaningfulChangedFiles`, which caused the live closeout mismatch when the latest retry had no meaningful diff.
- `packages/agent/src/subagents/implementer.ts` validates `aif-result` only for rework and blocks `missing_aif_result_contract` before implementation-manifest extraction/repair. This means stronger external completion evidence currently has no chance to bypass missing `aif-result`.
- `packages/api/src/routes/tasks.ts` already has task event routing and update routes, but no `POST /tasks/:id/operator-verified-completion` route exists in local search.
- `packages/shared/src/stateMachine.ts` allows `approve_done` only from `done`, and `retry_from_blocked` returns to the original blocked status. There is no state-machine event for operator verified completion.
- Independent explorer research confirmed the earlier P0 hardening already exists in the current branch:
  - repeated tool-loop guard and structured `repeated_tool_loop_blocked` in `packages/runtime/src/adapters/qwenLocalAgent/api.ts`;
  - stage default repeated-tool caps in `packages/shared/src/runtimeStagePolicy.ts`;
  - tool-level allowed-write-path enforcement in `packages/runtime/src/adapters/qwenLocalAgent/tools.ts`;
  - checklist hard stop in `packages/agent/src/subagents/implementer.ts`;
  - invalid deterministic implementation-manifest fallback rejection in `packages/agent/src/subagents/implementer.ts`;
  - strict `aif-result` rework validation in `packages/shared/src/aifResultContract.ts` and `packages/agent/src/subagents/implementer.ts`.
- Independent explorer research also confirmed the closeout gap:
  - no formal `operator_verified_completion` route or event was found;
  - no `operatorCompletionEvidenceJson` or equivalent task evidence source was found;
  - `evaluateTaskCompletionEvidence` does not currently accept operator completion evidence;
  - coordinator skip paths can avoid redundant rework only when existing completion evidence already passes, not when external operator evidence should complete the task.

## Same-Project Memory

Not used before `PLAN PASS`. Repository instructions forbid shared-memory recall before `PLAN PASS` unless explicitly waived; local repo facts and RDPI artifacts are sufficient for planning.

## Cross-Project Reusable Patterns

Not used before `PLAN PASS` for the same reason.

## Rejected Or Stale Memory Candidates

- The original broad hardening task is not treated as incomplete. Its result artifact says P0 scope was completed, and the live E2E found a newer closeout-specific gap.
- The server E2E smoke artifact itself is not treated as failed. It passed 27 checks with 0 failures; the failure is workflow closeout, not API contract behavior.

## Planning Risks

- A manual closeout endpoint must not bypass audit/report validators or unresolved blockers.
- A trusted operator path must be narrow enough to avoid turning operator input into arbitrary status mutation.
- Clean committed worktree support must not accidentally accept unrelated base-branch commits as current task evidence.
- If implementation changes touch API schemas, task event services, shared evidence validation, and data persistence together, tests need to cover both API behavior and shared validator behavior.
