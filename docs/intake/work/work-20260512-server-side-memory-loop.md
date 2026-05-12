# Implement Server-Side Memory Loop For AIF Handoff

## Title

Implement Server-Side Memory Loop For AIF Handoff

## Task ID

work-20260512-server-side-memory-loop

## Lane

work

## Status

inbox

## Priority

high

## Created

2026-05-12

## Due

TBD

## Source

User request in Codex thread: queue follow-up work so AIF Handoff's deployed server can support product-owned shared memory/self-learning, independent from local Codex tooling.

## RDPI Needed

yes

## RDPI Path

docs/rdpi/work/work-20260512-server-side-memory-loop

## Request

Design and implement a server-side memory loop inside AIF Handoff so completed tasks can produce curated memory candidates and future planner, implementer, reviewer, and chat runtime calls can receive relevant project/product memory without depending on the operator's local Codex environment.

The feature should treat "self-learning" as retrieval and curated context, not model fine-tuning. The implementation should be runtime-neutral and work for runtimes that do not consume project `.mcp.json` directly, including qwen-local-agent.

Expected scope includes:

- persistent memory storage owned by AIF Handoff;
- memory candidate extraction after successful task close-out;
- secret/redaction safeguards;
- review/publish/expire controls;
- project-local and reusable/global memory scopes;
- retrieval before planner, implementer, reviewer, and chat prompts;
- prompt injection with citations or source references;
- task-level audit trail showing which memory items were used;
- API and UI surfaces for pending and approved memory;
- deployment/configuration docs for the isolated server runtime.

## Done When

- AIF Handoff has a documented server-side memory model with clear data ownership, scopes, and publish rules.
- Memory candidates are generated only after appropriate task completion gates and remain reviewable before publication unless the design explicitly proves a safe auto-publish path.
- Runtime prompts receive relevant approved memory through server-owned retrieval, not through local Codex tools.
- Memory injection is covered for planner, implementer, reviewer, and chat flows.
- Secrets and credentials are redacted and blocked from publication.
- Operators can inspect, approve, reject, expire, and trace memory usage in API/UI.
- Tests cover extraction, retrieval, prompt injection, redaction, and disabled/configured states.
- Documentation explains that this is product memory/retrieval, not model fine-tuning.

## Constraints

- Do not couple this feature to local Codex shared-memory tools.
- Do not assume `.mcp.json` alone solves memory for all runtimes.
- Keep the server deployment isolated from the local development environment.
- Do not publish raw secrets or unreviewed RDPI notes as memory.
- Preserve existing task pipeline gates and avoid making memory writes a blocker for ordinary task completion unless explicitly configured.
- Follow RDPI gates before implementation.

## Notes

- Related audit finding: `docs/rdpi/work/work-20260512-server-project-readiness-audit/result.md` reported that memory/self-learning is operator-driven, not server-automatic.
- The Handoff MCP service and project MCP server list are separate concerns from server-owned product memory.
- MVP recommendation from discussion: SQLite/FTS-backed memory store, extraction after successful review, manual approval, retrieval plus prompt injection across stage runners and chat.

## Links

- https://github.com/five-x/aif-handoff
- ../../rdpi/work/work-20260512-server-side-memory-loop
