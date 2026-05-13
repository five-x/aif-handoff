<!-- Managed by codex-platform; audit planning artifact. -->

# Research

## Task framing and lane

- Task: audit what must be installed and configured on the `aif-handoff-01` server so the current AIF Handoff project and future onboarded projects work as intended.
- Lane: `work`.
- Task id: `work-20260512-server-project-readiness-audit`.
- This is an audit/live-validation task. Before `PLAN PASS`, evidence is limited to local repository docs and source files. No SSH, Docker, live endpoint, log, scheduler, downstream runtime/config, or shared-memory probing has been performed.

## Accepted planning sources

- `AGENTS.md`: local repo facts outrank memory; `docs/rdpi/` is task history; `docs/memory/` stores curated memory candidates; do not publish memory before review.
- `.agents/skills/rdpi/SKILL.md`: audit tasks require planning-only artifacts before `PLAN PASS`, then live evidence after an independent plan gate.
- `.agents/skills/memsync/SKILL.md`: stable task knowledge is curated into project-scoped memory; publish only validated/shareable non-secret knowledge.
- `docs/architecture.md`: AIF Handoff is a Docker-friendly monorepo with API, web, agent, runtime, data, and MCP surfaces; the coordinator drives planning, implementation, review, rework, auto-queue, warmup, and runtime-limit behavior.
- `docs/getting-started.md`: production compose exposes only web ports and uses a named Docker volume at `PROJECTS_MOUNT`; projects in production are selected by in-container paths such as `/home/www/app`.
- `docs/ops/aif-handoff-01.md`: expected deployment host is `ubuntu@192.168.88.67`, repository path `/opt/aif-handoff`, projects path `/srv/aif-handoff/projects`, API and MCP ports bound to localhost, and web on LAN port 80.
- `docs/providers.md`: runtime profiles are non-secret DB records; secrets stay in environment variables; Docker images include Claude Code and Codex; production should rely on provider API keys rather than the dev Codex login proxy.
- `.env.example` and `packages/shared/src/env.ts`: relevant feature flags include `AGENT_USE_SUBAGENTS`, `AGENT_BYPASS_PERMISSIONS`, `AIF_TASK_WORKTREES_ENABLED`, `AIF_WARMUP_ENABLED`, `AIF_RUNTIME_SESSION_FORK_ENABLED`, `AIF_USAGE_LIMITS_ENABLED`, provider keys, MCP settings, broadcast token, and activity logging settings.
- `docker-compose.production.yml`: production defines `api`, `web`, `agent`, and `mcp`; mounts DB/auth volumes; binds API/MCP to `127.0.0.1`; sets `AIF_ENABLE_CODEX_LOGIN_PROXY=false`; sets `AGENT_BYPASS_PERMISSIONS=true`; uses a named `projects` volume mounted at `${PROJECTS_MOUNT:-/home/www}`.
- `docker-compose.yml`: dev compose uses a host bind mount `${PROJECTS_DIR:-${PWD}/projects}:${PROJECTS_MOUNT:-/home/www}` plus `PROJECTS_HOST_ROOT` path mapping.
- `packages/runtime/src/projectInit.ts`: project creation should create a base git repo and run `ai-factory init --agents <runtime agents>` when `.ai-factory/` is absent.
- `.ai-factory/config.yaml`: current project config uses git branches, `base_branch: main`, `branch_prefix: feature/`, and standard `.ai-factory` paths.

## Same-project memory

- Same-project memory may matter after `PLAN PASS` for prior deployment and mount decisions, but shared-memory recall was not queried before the plan gate.

## Cross-project reusable patterns

- No cross-project memory was queried before `PLAN PASS`.
- Reusable local pattern already present in project docs: keep secrets out of shared memory and store only redacted operational pointers.

## Rejected or stale memory candidates

- No memory candidates were queried before `PLAN PASS`.

## Open questions

- Is the live server currently using `docker-compose.production.yml` exactly, or an overridden compose file?
- Is `/srv/aif-handoff/projects` actually mounted into containers, or is the production named Docker volume being used instead?
- Which runtime profiles are intended defaults for task, plan, review, and chat on the current project and on new projects?
- Should future projects rely on Claude API keys, Claude CLI auth volume, Codex API keys, Codex App Server auth volume, OpenRouter, Qwen local agent, or a mix?
- Is shared-memory publishing expected to run from the operator workstation only, or should the production server/container have a supported memory bridge?
- Should project warmup/session fork be enabled for future projects, or remain off until a canary proves the selected runtime supports it safely?
- Is parallel auto-queue desired for branch-isolated projects? If yes, should `AIF_TASK_WORKTREES_ENABLED=true` be enabled with disk monitoring?

## Hypotheses

- The server likely already has enough application services if `api`, `web`, `agent`, and `mcp` are healthy; missing behavior is more likely to be configuration, path mapping, credentials, runtime profiles, or memory workflow than missing Node packages on the host.
- Production project storage may be misaligned: local docs name `/srv/aif-handoff/projects`, while `docker-compose.production.yml` currently uses a named Docker volume for `projects`.
- For unattended work, runtime profiles plus provider credentials are the critical server setup, not MCP alone.
- For "self-learning" behavior, the missing operational piece may be a documented memory close-out process for projects rather than automatic fine-tuning.
