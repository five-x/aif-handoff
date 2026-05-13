# Implement Qwen Local Agent Runtime

- Task ID: work-20260509-implement-qwen-local-agent-runtime
- Lane: work
- Status: done
- Priority: high
- Created: 2026-05-09
- Due: unset
- Source: follow-up from `work-20260509-qwen-local-agent-runtime-canary`
- RDPI Needed: yes
- RDPI Path: docs/rdpi/work/work-20260509-implement-qwen-local-agent-runtime

## Request

Implement a dedicated AIF local-model agent runtime for Qwen so local inference can perform real repository work through an AIF-controlled tool loop.

The previous canary proved that the `codex app-server -> llama.cpp` route reaches the local Qwen endpoint but fails before tool execution because the endpoint rejects Codex Responses tool schema with:

```text
'type' of tool must be 'function'
```

This task should build the next runtime path:

```text
AIF task on 67
  -> qwen-local-agent runtime/tool loop on 67
    -> protected Qwen llama.cpp inference endpoint
    -> allowlisted repo tools inside the task project root
```

## Done When

- A new explicit runtime adapter/profile path exists for local Qwen agent execution without replacing current `codex`, `claude`, `opencode`, or raw API profiles.
- The runtime calls the existing OpenAI-compatible Qwen endpoint using function-style tools compatible with current llama.cpp behavior.
- The tool executor is controlled by AIF and runs only inside the configured project root.
- Minimum tools support read/list/write-or-patch/shell/git operations needed for audit and fix tasks.
- Shell execution is constrained by workspace allowlist, cwd enforcement, timeout handling, and clear error reporting.
- Tool calls, arguments, exit codes, touched files, and final results are recorded in existing runtime/activity logs in a reviewable form.
- The runtime does not read secret files and does not expose raw secrets into shared memory or task logs.
- The implementation includes a narrow canary profile for the Bot Intevra project but does not make it default until acceptance evidence proves real file/shell/git execution.
- Acceptance canary creates and commits a small `audit/test-agent-runtime.md` file in `/home/www/botIntevra` through the new runtime.
- Existing raw Qwen inference endpoints on `62` remain untouched.
- Existing app-server diagnostic improvements continue to pass their regression tests.

## Constraints

- Intake only for this turn; do not implement the runtime or inspect live production state while creating this task.
- Follow RDPI before any repository changes.
- Do not modify, restart, or reconfigure protected raw inference endpoints on `62`.
- Do not make the new runtime a global or project default during first implementation.
- Keep the first implementation narrow: prove one safe local-agent path before optimizing quality, memory, or multi-model routing.
- Prefer existing AIF runtime adapter interfaces, task activity logging, project root resolution, and runtime profile mechanisms.
- Keep secrets outside the repo, outside shared memory, and outside generated RDPI/memory artifacts.
- After implementation, require independent `TEST PASS` and `REVIEW PASS` gates before close-out.

## Notes

- Prior canary task: `work-20260509-qwen-local-agent-runtime-canary`.
- Prior canary profile: `QwenLocalAgent Canary`; it is diagnostic only and should not be treated as a working local-agent runtime.
- The custom runtime should live where the workspace and tool execution already live, not on the inference host.
- Function-style tool schema is the key compatibility boundary to verify during RDPI.
- The first acceptance test should prove real file creation, shell inspection, git status, and commit in the target project workspace.

## Links

- RDPI scaffold: ../../rdpi/work/work-20260509-implement-qwen-local-agent-runtime
- Previous RDPI result: ../../rdpi/work/work-20260509-qwen-local-agent-runtime-canary/result.md
