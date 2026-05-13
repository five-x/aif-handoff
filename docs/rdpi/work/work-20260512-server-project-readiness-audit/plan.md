<!-- Managed by codex-platform; audit planning artifact. -->

# Plan

## Audit plan

1. Run an independent plan review gate and require `PLAN PASS` before live evidence collection.
2. After `PLAN PASS`, identify the exact live deployment surface:
   - SSH target: `ubuntu@192.168.88.67`.
   - Repository path: `/opt/aif-handoff`.
   - Commands: `pwd`, `git rev-parse --show-toplevel`, `git status --short`, `git log -1 --oneline`, `docker compose version`, and `docker compose ps`.
3. Inspect compose configuration without exposing secrets:
   - `docker compose config` with environment values redacted where needed.
   - Verify whether production uses `docker-compose.production.yml`, default compose, or overrides.
   - Verify `api`, `agent`, and `mcp` project mounts resolve to the intended host/container paths.
4. Check service health and network boundaries:
   - `curl -fsS http://127.0.0.1:3009/health`
   - `curl -fsS http://127.0.0.1:3100/health`
   - `curl -fsSI http://localhost/`
   - LAN check for `http://192.168.88.67/api/health` if reachable from the current environment.
   - Confirm API/MCP are not exposed beyond localhost unless intentionally configured.
5. Check sanitized runtime environment:
   - Read `.env` keys only, redacting values.
   - Confirm provider credential presence for intended runtimes.
   - Confirm production-only flags: `AIF_ENABLE_CODEX_LOGIN_PROXY=false`, `DATABASE_URL=/data/aif.sqlite`, `API_BASE_URL=http://api:3009`, `MCP_TRANSPORT=http`, `MCP_PORT=3100`.
   - Confirm desired flags for agent behavior: `AGENT_USE_SUBAGENTS`, `AGENT_BYPASS_PERMISSIONS`, `AGENT_AUTO_REVIEW_STRATEGY`, `AGENT_MAX_REVIEW_ITERATIONS`, `AIF_TASK_WORKTREES_ENABLED`, `AIF_WARMUP_ENABLED`, `AIF_RUNTIME_SESSION_FORK_ENABLED`, `AIF_USAGE_LIMITS_ENABLED`, `INTERNAL_BROADCAST_TOKEN`.
6. Check project storage and permissions:
   - Validate `/srv/aif-handoff/projects` existence, owner, mode, disk usage, and relationship to Docker mounts.
   - Validate container visibility at `${PROJECTS_MOUNT:-/home/www}` from `api`, `agent`, and `mcp`.
   - Verify current project root records point to container-accessible paths.
   - Verify a future project path convention, e.g. `/home/www/<project-slug>`, is documented and usable.
7. Check database-backed configuration through API or sanitized DB queries:
   - List projects and root paths.
   - List enabled runtime profiles and their non-secret fields.
   - Verify default task/plan/review/chat runtime profile selection at app and project scopes.
   - Verify current tasks are not stuck in stale processing states.
8. Check runtime executability without writes or task execution:
   - Confirm installed CLI binaries inside `agent`: `claude`, `codex`, `git`, `curl`, and `npx ai-factory --version`.
   - Validate runtime profiles through existing API endpoints where possible.
   - Do not create projects, create tasks, edit files, run roadmap import, run agent stages, or execute a write canary in this audit.
   - If a write/execution canary is needed, record it as a separate follow-up task with explicit target, cleanup, and evidence rules.
9. Check MCP readiness:
   - Confirm MCP HTTP health.
   - Confirm MCP server config exposed by project endpoint if relevant.
   - Confirm expected client configuration points to `http://127.0.0.1:3100/mcp` from inside/near the server, or to the reverse-proxied endpoint if intentionally exposed.
10. Check memory/self-learning readiness:
    - Verify local RDPI and `docs/memory` workflow exists for the current project.
    - Verify `codex-memsync.py` availability where the close-out process is expected to run.
    - Do not publish memory during audit; record whether production memory publication needs a separate implementation task.
11. Summarize findings into `result.md`:
    - Current readiness status.
    - Missing installs/configuration.
    - Risks and severity.
    - Required follow-up task cards, if any.
    - Evidence commands, sanitized outputs, and gate outcomes.
12. Run independent test/review gates for the audit artifact quality:
    - `TEST PASS`: evidence is complete, sanitized, and mapped to acceptance criteria.
    - `REVIEW PASS`: findings are supported by evidence and do not include secrets or implementation beyond audit scope.
13. Only after `TEST PASS` and `REVIEW PASS`, run `memsync MODE=auto LANE=work TASK_ID=work-20260512-server-project-readiness-audit` if the audit closes successfully.

## Acceptance criteria

- The audit identifies whether the server has the required deployment services, project storage, credentials, runtime profiles, MCP endpoint, and memory workflow for current and future projects.
- Every live finding is backed by a concrete command or endpoint check run after `PLAN PASS`.
- Secret values are never printed, copied into artifacts, or published to memory.
- Any required installation/configuration changes are listed as follow-up tasks and not applied during the audit unless the user explicitly expands scope.
- The audit explicitly answers whether future projects should be created under a named Docker volume path, `/srv/aif-handoff/projects`, or another documented convention.
- The audit explicitly answers whether production should support memory publication on-server or keep memsync as an operator/local close-out step.
- Any recommendation to prove runtime execution with a canary is queued as a follow-up unless the user separately approves expanding this audit scope.

## Verification plan

- Plan gate: independent reviewer returns `PLAN PASS` or `PLAN FAIL`.
- Live checks after `PLAN PASS`: SSH/Docker/HTTP/API/MCP/env/project/runtime/memory checks listed above.
- Artifact checks:
  - `git diff --check -- docs/rdpi/work/work-20260512-server-project-readiness-audit`
  - confirm `result.md` contains no raw secrets.
- Test gate: independent tester returns `TEST PASS` or `TEST FAIL` for audit completeness and sanitization.
- Final review gate: independent reviewer returns `REVIEW PASS` or `REVIEW FAIL`.

## Reusable patterns

- Treat production audits as read-only until findings are approved as separate implementation tasks.
- For AIF Handoff project readiness, always validate four layers together: project path mapping, runtime profiles/secrets, agent execution policy, and memory close-out workflow.
