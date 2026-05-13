<!-- Managed by codex-platform; audit planning artifact. -->

# Design

## Goal

Produce a server-readiness audit for `aif-handoff-01` that answers:

- what is already installed and configured correctly;
- what is missing or risky for the current project;
- what must be standardized so future projects work through AIF Handoff without one-off repair;
- which follow-up implementation tasks should be queued, without auto-running them during this audit.

## Scope

The audit will cover:

- host and deployment layout: repository path, compose file selection, container status, image age, restart policy, resource limits, disk space, and backups;
- network and health: LAN web route, reverse proxy, API health, MCP health, local-only API/MCP bindings;
- project storage and path mapping: host path, container mount path, project root records, permissions, git availability, `.ai-factory` scaffold, and future-project onboarding behavior;
- runtime readiness: provider credentials, runtime profiles, task/plan/review/chat defaults, model discovery, runtime capabilities, usage-limit toggle, and auth volumes;
- agent pipeline readiness: coordinator wake/polling, subagent mode, review/rework settings, branch/worktree settings, auto-queue, warmup feature flags, activity logging, and stale-stage recovery;
- MCP readiness: HTTP transport health, client install config, task sync tools, project MCP config endpoint, and rate-limit settings;
- memory/self-learning readiness: RDPI artifacts, `docs/memory` curation, memsync availability, shared-memory boundary, and whether production should support memory publication or only local/operator publication;
- security and secrets: `.env` key presence without exposing values, broadcast token, provider secret storage, dev-only Codex login proxy disabled in production, and backup scope;
- canary readiness: read-only validation that the prerequisites for project init, runtime execution, review gate, MCP sync, and memory close-out exist. Any write/execution canary must be queued as a separate implementation/validation task or explicitly approved as a separate scope expansion after this audit plan.

## Out of scope

- No code changes unless the audit reveals follow-up cards; audit findings can queue implementation tasks only.
- No automatic creation/execution of child tasks in this run.
- No raw secret disclosure in artifacts, logs, or final output.
- No shared-memory publishing before successful audit close-out gates.

## Evidence model

Before `PLAN PASS`:

- local repository docs, source, compose files, and config examples only.

After `PLAN PASS`:

- live server evidence from SSH, Docker, health endpoints, sanitized environment inspection, sanitized database/API reads, and non-secret filesystem metadata.
- evidence must be recorded as command, sanitized output summary, and verdict.

## Expected readiness baseline

- Docker service set: `api`, `web`, `agent`, `mcp`.
- API and MCP bind only to localhost on the VM; web/reverse proxy is LAN-facing.
- Provider authentication exists for at least one production-grade runtime profile.
- Runtime defaults are set at app or project level for task, planning, review, and chat.
- New projects resolve to a container-accessible root under the configured project mount.
- New project initialization prerequisites are present: `ai-factory` is available, project mount is writable by the intended service user, git is available, and `.ai-factory` defaults are documented.
- Agent execution prerequisites are present for the selected trust model; actual canary task execution is not part of this read-only audit unless separately approved.
- MCP health is good and client configs point to the correct HTTP or stdio endpoint.
- Memory close-out is explicit: RDPI result -> local memory review -> optional shared-memory publish of curated non-secret artifacts.

## Risks to validate

- Production compose may not mount `/srv/aif-handoff/projects` despite the runbook naming it as the projects path.
- `AGENT_BYPASS_PERMISSIONS=true` is required for unattended Docker execution, but it also means the container trust boundary must be accepted and documented.
- `AGENT_USE_SUBAGENTS=false` by default may mean future projects use skills directly unless task/project settings override it.
- Parallel branch-isolated execution requires `AIF_TASK_WORKTREES_ENABLED=true`; enabling it without disk monitoring can accumulate retained worktrees.
- Warmup/session-fork flags are off by default and should only be enabled for runtimes that support session fork.
- Production memory publication from inside containers is not established by local docs and may need a separate design.
