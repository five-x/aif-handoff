# Research

## Task Framing And Lane

- Task ID: `work-20260602-aif-agent-workflow-stabilization`
- Lane: `work`
- Intake card: `docs/intake/work/work-20260602-aif-agent-workflow-stabilization.md`
- Source TZ: `C:/Users/apron/Desktop/aif_agent_workflow_stabilization_tz.md`
- RDPI needed: yes

The task asks to replace prompt-only agent discipline with code-enforced runtime, tool, parser, validator, and recovery contracts. P0 items are mandatory for this run: repeated tool-loop guard, implementer checklist hard stop, invalid deterministic implementation manifest rejection, compact rework result contract, and allowed write path enforcement. P1 and P2 may be implemented or queued as explicit follow-up intake cards with preserved acceptance criteria.

## Accepted Planning Sources Or Local Facts

- Repository guidance requires RDPI, independent plan/test/review gates, no implementation before `PLAN PASS`, and no child implementation task execution in the same run.
- Required preflight command succeeded with `STATUS: ready`.
- Flow audit command succeeded with `STATUS: clean`.
- `package.json` confirms a Node workspace with `npm.cmd run lint`, `npm.cmd test`, and `npm.cmd run build` as repo commands.
- Current task card exists at `docs/intake/work/work-20260602-aif-agent-workflow-stabilization.md`; the task status in `docs/intake/work_status.json` is `inbox`.
- Existing RDPI scaffold files exist under `docs/rdpi/work/work-20260602-aif-agent-workflow-stabilization/`.

Local code facts:

- Runtime stage defaults live in `packages/shared/src/runtimeStagePolicy.ts`. Qwen defaults currently set `repeatedToolCallLimit` only for `implementer`, while the task requires repeated-call defaults for planner, plan_checker, implementer, reviewer, qa, audit, and synthesis.
- Qwen local runtime tool loop logic lives in `packages/runtime/src/adapters/qwenLocalAgent/api.ts`. It currently builds stable JSON signatures from tool name and args, suppresses repeated calls, and returns normal output text after repeated suppressions. It does not emit a named `repeated_tool_loop_blocked` event, include workflow/cwd/allowedWritePaths in the fingerprint, or fail the runtime attempt as a controlled failure.
- Qwen tool execution lives in `packages/runtime/src/adapters/qwenLocalAgent/tools.ts`. It already enforces `allowedWritePaths` for `write_file`, `apply_patch`, `git_commit`, and audit report manifest/hash tools. `run_shell` is structured and allowlisted, but it is not explicitly tied to `allowedWritePaths` for write-capable commands.
- Implementer post-run handling lives in `packages/agent/src/subagents/implementer.ts`. After checklist auto-sync, pending checklist items currently produce a warning and the flow continues. The task requires a hard `blocked_external` stop.
- Deterministic implementation manifest fallback in `packages/agent/src/subagents/implementer.ts` currently returns `validation.normalizedJson` even when validation fails. The task requires invalid normalized fallback JSON to be diagnostic only, not accepted evidence.
- Implementation manifest validation already exists in `packages/shared/src/implementationManifest.ts`; completion evidence evaluation already exists in `packages/shared/src/taskCompletionEvidence.ts`.
- Rework output currently accepts freeform result text and implementation manifest fences. There is no shared `aif-result` contract helper.
- Planner split-required behavior is currently prompt/quality-gate oriented in `packages/agent/src/subagents/planner.ts` and `packages/shared/src/planQuality.ts`. There is no strict `aif-planning-decision` parser/state.
- ReviewGate has project-specific hardcoded refutation logic in `packages/agent/src/reviewGate.ts`.
- Observability has generic runtime events, but no named counters/events matching the P2 requested contract.

Delegated explorer facts:

- Explorer `Pascal` independently confirmed the same affected areas and mismatches without editing files or running runtime-visible probes.
- Explorer identified existing tests around repeated runtime suppression, scoped writes, implementation manifest validation, task completion evidence, and planner/task-size split quality.
- Explorer noted current tests assert some old weak behavior, especially pending checklist warning and repeated-tool suppression output.

## Same-Project Memory

Shared-memory recall was not used before `PLAN PASS` because the repository RDPI boundary forbids shared-memory recall before the plan gate unless explicitly waived. Local repo facts and task artifacts were sufficient for planning.

## Cross-Project Reusable Patterns

No cross-project memory was used before `PLAN PASS` for the same RDPI boundary reason.

## Rejected Or Stale Memory Candidates

No memory candidates were queried. Any future memory sync should publish only curated, non-secret task deltas after implementation, test, and review gates pass.
