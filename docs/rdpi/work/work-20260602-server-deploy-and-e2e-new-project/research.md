# Research

## Task Framing And Lane

- Task ID: `work-20260602-server-deploy-and-e2e-new-project`
- Lane: `work`
- User request: deploy to the server, run e2e tests on a new project, invent the project and create the tasks.
- RDPI needed: yes, because this is live deployment and remote validation work.

The requested outcome is a server rollout of the current intended repository delta, then an end-to-end validation against the deployed AIF instance by creating a fresh project and backlog tasks. The task does not authorize executing those newly created backlog tasks through the agent; they should be created as queued work only.

## Accepted Planning Sources Or Local Facts

- Repository guidance requires RDPI, independent `PLAN PASS` before runtime-visible probing, and independent `TEST PASS` and `REVIEW PASS` before closeout.
- Pre-plan boundary: no SSH, service checks, live endpoint checks, logs, scheduler reads, or shared-memory recall were performed before this planning artifact.
- Current branch is `codex/roadmap-audit-oom-hardening`, tracking `origin/codex/roadmap-audit-oom-hardening`.
- Current worktree is dirty from the prior completed workflow-stabilization task. The unrelated dirty file `docs/kb/windows-codex-bootstrap-validation.md` must be preserved and excluded from staging/commit/deploy scope unless explicitly requested.
- Deploy anchor in `docs/memory/ops/aif-handoff-01-deploy-anchor.md` identifies:
  - LAN UI: `http://192.168.88.67/`
  - LAN API: `http://192.168.88.67/api`
  - SSH: `ubuntu@192.168.88.67` using `C:\Users\apron\.ssh\codex_linux_key_5`
  - server repo: `/opt/aif-handoff`
  - host projects path: `/srv/aif-handoff/projects`
  - container project mount: `/home/www`
  - normal deployment path: push intended commit, then roll out from `/opt/aif-handoff`.
- `docs/ops/aif-handoff-01.md` provides server commands:
  - `cd /opt/aif-handoff`
  - `docker compose up -d --build`
  - `docker compose ps`
  - health checks for API, MCP, and web.
- `docker-compose.yml` exposes development bind-mounted projects and sets `PROJECTS_DIR`, `PROJECTS_HOST_ROOT`, and `PROJECTS_MOUNT`.
- `docker-compose.production.yml` uses named Docker volume `projects` mounted at `${PROJECTS_MOUNT:-/home/www}` and binds API/MCP only to localhost; LAN access goes through web reverse proxy.
- `packages/api/src/repositories/projects.ts` maps host project paths under `PROJECTS_DIR` to the container mount and validates root paths before calling `initProject`.
- `packages/shared/src/pathValidation.ts` requires absolute paths and rejects shell metacharacters and system directories. `/home/www/<project>` is allowed by policy.
- `packages/shared/src/projectInit.ts` creates the project directory and initializes a git repo; runtime `initProject` may also invoke `ai-factory init`.
- `packages/api/src/schemas.ts` confirms `POST /projects` requires `name` and `rootPath`.
- `packages/api/src/schemas.ts` confirms `POST /tasks` requires `projectId` and `title`; `description`, `priority`, `autoMode`, `taskIntent`, `plannerMode`, `paused`, and `tags` are supported.
- `packages/api/src/routes/tasks.ts` resolves task defaults and creates tasks through `createTask`. Creating with `autoMode=false` and `paused=true` is the safest backlog-only behavior for this e2e.
- `packages/shared/src/taskIntentContracts.ts` allows `general`, `feature`, `fix`, `spike`, `docs`, and `tests` task intents. Direct `audit` cards require a report artifact contract, so audit is intentionally avoided for this e2e seed.
- `packages/web/e2e/README.md` says web perf validation targets the deployed service at `192.168.88.67` and must not run against the local dev stack by default.
- `packages/web/scripts/run-perf.mjs` waits for the remote web URL, then runs Playwright with `AIF_WEB_URL` and `AIF_API_URL`.
- Existing remote e2e/perf specs cover dashboard load, runtime profiles endpoint timing, and chat sessions endpoint timing.

## Intended E2E Seed Project

- Project name: `E2E Launch Lab 2026-06-02`
- Preferred API root path: `/home/www/e2e-launch-lab-20260602`
- Host-visible equivalent if needed for operator inspection: `/srv/aif-handoff/projects/e2e-launch-lab-20260602`

Backlog tasks to create:

1. `Build remote launch checklist`
   - Intent: `docs`
   - Purpose: document the launch checklist and rollback notes for this test project.
2. `Add deployment health probe script`
   - Intent: `feature`
   - Purpose: add a small script that verifies API, MCP, and web health.
3. `Write onboarding smoke-test notes`
   - Intent: `docs`
   - Purpose: capture manual smoke steps and expected screenshots.
4. `Add API contract smoke tests`
   - Intent: `tests`
   - Purpose: cover project and task creation/list readback.

All four tasks should be created with `autoMode=false` and `paused=true` so this deploy validation does not start implementation work in the newly invented project.

## Same-Project Memory

Shared-memory recall was not used because local repo facts, deploy anchors, and runbooks were sufficient, and the RDPI boundary forbids shared-memory recall before `PLAN PASS` unless explicitly waived.

## Risks And Constraints

- Server-side live checks may reveal the server branch, worktree, compose file selection, or project mount differs from local docs. If so, stop rather than overwriting or resetting server state.
- If the server repo has uncommitted changes, fail closed and report the dirty state instead of forcing a pull or reset.
- If local validation fails, deployment should not proceed unless the failure is clearly unrelated and documented.
- If git push is unavailable or rejected, deployment through the normal runbook path is blocked.
- If project creation fails because the production project mount differs from documented facts, collect the failure response after `PLAN PASS` and use a read-only server env check to pick the correct mounted path.
