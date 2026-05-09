# Research - Implement Qwen Local Agent Runtime

Task ID: `work-20260509-implement-qwen-local-agent-runtime`
Lane: `work`
Date: 2026-05-09

## Task Framing

The intake card requests implementation of a new explicit `qwen-local-agent` runtime path, not another audit-only canary. The target path is:

```text
AIF task on 67
  -> qwen-local-agent runtime/tool loop on 67
    -> protected Qwen llama.cpp inference endpoint
    -> allowlisted repo tools inside the task project root
```

`RDPI Needed` is `yes`, so implementation required Research, Design, Plan, independent `PLAN PASS`, then implementation with independent `TEST PASS` and `REVIEW PASS`.

## Accepted Local Facts

- The prior canary showed `codex app-server` can reach the local Qwen endpoint but fails before tool execution because llama.cpp rejects Codex Responses tools with `'type' of tool must be 'function'`.
- Existing runtime contracts already support `api` transport, profile options, headers, `projectRoot`, `cwd`, execution callbacks, usage context, and runtime events.
- `bootstrapRuntimeRegistry()` is the built-in adapter registration point.
- `resolution.ts` handles runtime/profile defaults and needed Qwen-specific env inference.
- `toolEvents.ts` and agent activity hooks can record runtime-neutral tool activity if the adapter emits sanitized `tool:use` and `tool:result` events.
- The task explicitly forbids changing existing `codex`, `claude`, `opencode`, raw API profile behavior, or raw Qwen inference endpoints on `62`.

## Assumptions

- The protected Qwen endpoint is OpenAI-compatible enough for `/chat/completions` with `tools: [{ type: "function", function: ... }]`.
- The first runtime should expose a narrow repo tool set: list, read, write, patch, structured shell, git status, and git commit.
- Shell must not be an arbitrary command runner. It needs command allowlisting, cwd enforcement, timeouts, sanitized environment, and redacted output.

## Memory

Shared memory was not used before the plan gate. Local repo facts and prior RDPI artifacts were sufficient for planning.
