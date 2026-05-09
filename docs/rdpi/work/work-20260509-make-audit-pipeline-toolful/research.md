# Research

Task: make audit cards execute through tool-backed agents on server 67, produce committed report artifacts, return to rework/blocking when evidence is insufficient, and keep the memory/self-learning close-out path working.

## Local Facts

- The repository was clean after committing the previous completion-evidence guard as `b994558 fix: harden audit completion evidence`.
- RDPI preflight reported `STATUS: ready`.
- The prior bad audit card used a Codex API-style local Qwen profile and logged `Runtime does not support agent definitions` / `using direct workflow prompt`; no tool activity was visible.
- Prior RDPI result `work-20260509-implement-qwen-local-agent-runtime` established `qwen-local-agent` as the correct local Qwen path. It exposes function-style tools and an AIF-owned tool loop, while the raw Codex app-server/Qwen path failed because llama.cpp rejected Codex Responses tool schema.
- `packages/runtime/src/adapters/qwenLocalAgent/index.ts` declares the runtime as API transport with function-tool execution, but its capabilities do not currently advertise a distinct repository-tool capability.
- `packages/runtime/src/adapters/qwenLocalAgent/api.ts` always sends `tools: QWEN_LOCAL_AGENT_TOOLS` and emits runtime-neutral `tool:use`/`tool:result` events; `packages/agent/src/subagentQuery.ts` bridges `onToolUse` to task activity lines in the form `Tool: <name>`.
- `packages/agent/src/subagents/implementer.ts` short-circuits diagnostic-only plans with `writeDeterministicDiagnosticReportIfAvailable()` before the runtime is invoked. This creates reports without model tool use, exactly matching the failure mode observed on the manual audit card.
- `packages/agent/src/subagents/planChecker.ts` can still repair an invalid diagnostic audit plan into a deterministic diagnostic checklist plan. That is acceptable only as a planning artifact; implementation must still be performed by a tool-backed agent.
- `packages/shared/src/taskCompletionEvidence.ts` now blocks missing reports, uncommitted required reports, deterministic fallback reports, invalid report path references, zero delta, generic plans, branch isolation, and manual review requirements.
- The completion guard does not yet explicitly require actual tool activity for risky audit/review/discovery tasks.
- A broad `Tool:` check would be insufficient because planner/reviewer/checklist-sync activity or stale retries could satisfy it. The evidence must be scoped to the latest main implementation agent block (`implement-coordinator` or `aif-implement`) and ignore `implement-checklist-sync`, planner, and reviewer tool activity.
- `packages/agent/src/subagents/implementer.ts` only requires `supportsAgentDefinitions` when `useSubagents` is true, and `packages/agent/src/subagentQuery.ts` intentionally excludes `supportsAgentDefinitions` from hard capability failures to allow fallback strategies. A text-only runtime can therefore reach implementation if it satisfies no other hard requirement.
- `packages/agent/src/subagents/reviewer.ts` has the same pattern for review sidecars; without a repository-tool capability, text-only runtimes can be asked to review a repo diff they cannot inspect.
- `packages/mcp/src/tools/createTask.ts` and `packages/api/src/routes/tasks.ts` preserve `runtimeProfileId`, `modelOverride`, and `runtimeOptions` on task creation. The MCP path is already capable of carrying explicit runtime metadata.

## Same-Project Memory

- Shared-memory server is reachable: `memory_status` reported 1560 processed items and no pending/failed items.
- Shared-memory recall was not used before the plan gate. Local repo facts and existing RDPI artifacts were sufficient, and the RDPI contract forbids shared-memory recall before `PLAN PASS` unless explicitly waived.

## Findings

1. The audit system had a deterministic implementer fallback that could mark implementation complete without any runtime/tool execution.
2. Runtime capability checks do not distinguish tool-backed repository workers from text-only API runtimes. The prior bad `codex` + API/local-Qwen profile must remain `supportsRepositoryTools=false`.
3. Completion evidence does not yet fail closed when an audit/review/discovery task has no recorded implementation-stage tool usage.
4. The correct operational runtime for local Qwen audit work is `qwen-local-agent`, not the Codex API/app-server profile.
5. Memory curation is already represented by the RDPI/memsync workflow and must be run after result close-out; there is no evidence that the Handoff task coordinator itself can safely run host-level `codex-memsync.py` from inside containers without a separate design.

## Constraints

- Keep deterministic plan repair in the plan-checker as a planning guard, but remove deterministic report generation from implementation.
- Keep qwen-local-agent's file/shell/git tool set bounded to the project root.
- Do not widen qwen-local-agent shell permissions to run arbitrary memory scripts.
- Live server probing and task-card iteration start only after `PLAN PASS`.

## Proposed Verification Evidence

- Unit tests for runtime capability enforcement on implementer/reviewer workflows.
- Unit tests for completion evidence blocking risky tasks without `Tool:` activity.
- Unit test update proving diagnostic audit implementation now invokes the runtime instead of writing a deterministic report locally.
- Local build/test commands for changed packages.
- Deployment to `192.168.88.67`.
- Live audit card created after deployment using a `qwen-local-agent` profile.
- Live evidence must include task activity `Tool:` entries, a committed report artifact on the task branch, and a terminal state that is either correct `done` with evidence or `blocked_external`/rework with explicit findings.
