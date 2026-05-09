# Design

## Goal

Make audit execution fail closed unless the implementation/review stages are handled by a runtime that can actually use repository tools and unless completion evidence shows real tool activity and committed artifacts.

## Runtime Capability

Add an optional `supportsRepositoryTools` runtime capability.

- `true` only for the exact runtime/transport instance that exposes controlled repository tools and emits runtime-neutral tool events.
- `true` for `qwen-local-agent` API because AIF owns the function-tool loop and emits `tool:use`/`tool:result`.
- `true` for Claude SDK/CLI because those transports expose local repository tools and activity hooks.
- `true` for Codex CLI/SDK only if those transports emit local tool events through the existing adapter hooks.
- `false` or omitted for text-only API transports such as OpenRouter, Claude API, Codex API, and the prior bad `codex` API/local-Qwen profile.
- Keep Codex app-server false unless a separate profile-level validation proves that a specific configured app-server instance has a working repo tool/MCP environment and emits tool events. Do not infer safety from `runtimeId=codex` alone.

Implementation and review workflows will require `supportsRepositoryTools`. `supportsAgentDefinitions` remains soft because local Qwen can execute direct prompts with AIF-owned tools even though it does not support agent definition files.

## Remove Implementation Fallback

Remove the implementer shortcut that writes deterministic diagnostic reports. Diagnostic fallback plans may still be produced by the plan-checker to recover malformed audit plans, but the implementer must invoke the configured runtime to inspect files and write the report.

The completion guard already blocks deterministic fallback report markers. Removing the writer prevents the system from spending a stage on known-invalid output.

## Completion Evidence

Add `missing_implementation_tool_activity` to the completion evidence guard for risky audit/review/discovery tasks.

For completion-phase risky tasks, the guard requires at least one task activity line in the latest main implementation agent block:

- block starts at the latest `Agent: implement-coordinator started` or `Agent: aif-implement started`,
- block ends at the matching `complete`/`failed` line or before the next non-matching agent start,
- counted lines must be `Tool:` entries inside that block,
- planner, plan-checker, reviewer, security, and `implement-checklist-sync` tool activity do not count,
- stale tool activity before a later implementer retry/rework does not count.

This is intentionally conservative: a valid audit must demonstrate repository interaction during the implementation/audit stage, not only a final text answer or a tool call in another stage.

For completion-phase risky tasks, report artifacts are treated as commit-required even if the task prompt did not explicitly say "committed report". An audit report that exists only as an untracked, staged, or dirty file is not closed.

## Operational Profile

After implementation and deploy, configure the botIntevra project on server 67 so task/review execution uses a `qwen-local-agent` runtime profile. Planning may use the same profile if no stronger plan profile is available.

The previously bad manual audit card may be deleted or left blocked; new validation cards should be created until the live behavior is correct.

## Memory

Run `$memsync MODE=auto LANE=work TASK_ID=work-20260509-make-audit-pipeline-toolful` after successful result close-out. Treat shared-memory publication failures as warnings only if local memory artifacts were written.

Automatic in-container memsync is out of scope for this patch because it requires a separate contract for host tools, credentials, and the shared-memory MCP bridge inside production containers.

## Capability Failure Handling

Runtime capability mismatches must not enter the normal transient runtime retry loop. A workflow that requires repository tools and receives a runtime without `supportsRepositoryTools` is a configuration error, not an external model outage.

Sanitize capability errors before writing them into task state, but preserve the error type so the stage error handler can move the task to `blocked_external` with no retry schedule. This prevents a text-only profile from repeatedly re-running implementation and obscuring the operator action needed: choose a tool-capable runtime profile.

## Risks

- Requiring repository tools for implementation/review may block projects that intentionally use text-only runtimes for source-changing work. This is desired for correctness: text-only implementation/review cannot create or inspect repository artifacts safely.
- Some valid tasks may not naturally need tools. The hard requirement applies only to implementation/review workflow runtime capability, while the completion `Tool:` evidence requirement applies only to risky audit/review/discovery tasks.
- Requiring committed report artifacts for all risky tasks may block a valid diagnostic if the runtime wrote the file but did not commit. That should return to the task loop rather than silently close, because the user needs durable artifacts.
- If a runtime emits tool events but the activity queue fails to flush, a valid audit could block. Stage boundaries already call `flushActivityQueue()`.
