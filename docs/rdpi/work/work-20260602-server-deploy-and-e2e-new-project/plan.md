# Plan

## Plan Status

Ready for independent plan review.

## Scope

Deploy the current intended code delta to `aif-handoff-01`, create one fresh remote AIF project, add paused backlog tasks invented for the project, and run remote e2e/perf validation against the deployed service.

Do not execute the newly created backlog tasks through the agent.

## Implementation Plan

1. Pre-deploy validation.

- Confirm the dirty worktree still matches expected deploy scope.
- Exclude `docs/kb/windows-codex-bootstrap-validation.md` from staging and deployment.
- Run:
  - `npm.cmd run test --workspace=@aif/runtime -- src/__tests__/qwenLocalAgent.test.ts`
  - `npm.cmd run test --workspace=@aif/agent -- src/__tests__/implementer.test.ts src/__tests__/subagentQuery.test.ts`
  - `npm.cmd run test --workspace=@aif/shared -- src/__tests__/runtimeStagePolicy.test.ts src/__tests__/aifResultContract.test.ts`
  - `npm.cmd run lint`
  - `npm.cmd test`
  - `npm.cmd run build`

2. Commit and push intended deploy scope.

- Stage prior workflow-stabilization files and this RDPI task directory.
- Do not stage unrelated dirty files.
- Commit the deployable delta.
- Push `codex/roadmap-audit-oom-hardening` to `origin`.

3. Server rollout after successful push.

- SSH to `ubuntu@192.168.88.67` with `C:\Users\apron\.ssh\codex_linux_key_5`.
- In `/opt/aif-handoff`, inspect branch and `git status --short`.
- If dirty, stop and report the server-side dirty files.
- Fetch and fast-forward to the pushed commit.
- Run `docker compose up -d --build`.
- Run `docker compose ps`.
- Run server-local health checks:
  - `curl -fsS http://127.0.0.1:3009/health`
  - `curl -fsS http://127.0.0.1:3100/health`
  - `curl -fsSI http://localhost/`
- Run LAN API health from the local machine:
  - `curl.exe -fsS http://192.168.88.67/api/health`

4. Create the new project and backlog tasks.

- Create project:
  - name: `E2E Launch Lab 2026-06-02`
  - rootPath: `/home/www/e2e-launch-lab-20260602`
- Read back the project from `GET /projects`.
- Create paused backlog tasks:
  - `Build remote launch checklist`, `taskIntent=docs`
  - `Add deployment health probe script`, `taskIntent=feature`
  - `Write onboarding smoke-test notes`, `taskIntent=docs`
  - `Add API contract smoke tests`, `taskIntent=tests`
- Use `autoMode=false`, `paused=true`, `plannerMode=fast`, tags `["e2e","deploy-20260602"]`, and descriptions with acceptance criteria and verification notes.
- Read back tasks from `GET /tasks?projectId=<id>`.
- Create and read back one comment on the first task.

5. Run remote e2e/perf validation.

- Set:
  - `AIF_SKIP_DEV_SERVER=1`
  - `AIF_WEB_URL=http://192.168.88.67`
  - `AIF_API_URL=http://192.168.88.67/api`
- Run `npm run perf --workspace=@aif/web`.
- If Playwright browser binaries are missing, run `npm run perf:install --workspace=@aif/web` and rerun the perf suite.

6. Write result and run independent gates.

- Write `result.md` with commit hash, server rollout evidence, created project id, task ids, health checks, e2e/perf results, and any residual risks.
- Run independent `TEST PASS` gate over the recorded evidence and, if practical, a focused readback command.
- Run independent `REVIEW PASS` gate over scope, git state, deployment safety, and e2e evidence.
- If either gate fails, revise and rerun the invalidated gate before final closeout.

## Acceptance Criteria

- Intended commit is pushed and deployed on `aif-handoff-01`.
- Server API, MCP, and web health checks pass after rebuild.
- LAN API health check passes.
- Remote project `E2E Launch Lab 2026-06-02` exists.
- Four paused backlog tasks exist under the project with the intended titles and intents.
- Task comment create/readback passes.
- Remote Playwright/perf suite passes against `http://192.168.88.67`.
- `docs/kb/windows-codex-bootstrap-validation.md` remains unmodified by this task and unstaged.
- Independent `PLAN PASS`, `TEST PASS`, and `REVIEW PASS` are recorded.

## Stop Conditions

- Local validation fails without a clearly unrelated reason.
- Local git push fails.
- Server repo is dirty or cannot fast-forward.
- Docker compose build/start fails.
- Any health check fails.
- API project/task e2e fails.
- Remote Playwright/perf suite fails after browser installation remediation.
