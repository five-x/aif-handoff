# Design

## Deployment Design

Use the documented deployment path: commit and push the intended local delta, then update the server checkout from `/opt/aif-handoff` and rebuild the compose services.

The intended deploy commit should include the prior completed workflow-stabilization changes plus this task's RDPI artifacts. It must exclude unrelated dirty state, specifically `docs/kb/windows-codex-bootstrap-validation.md`.

The rollout flow is:

1. Run local validation commands before deploy:
   - focused tests if needed for the touched workflow-stabilization code
   - `npm.cmd run lint`
   - `npm.cmd test`
   - `npm.cmd run build`
2. Stage only intended files.
3. Commit with a message that reflects the deployed code delta.
4. Push `codex/roadmap-audit-oom-hardening` to `origin`.
5. On `aif-handoff-01`, inspect the server repo status and branch.
6. If the server checkout is clean, `git fetch` and fast-forward to the pushed commit.
7. Run `docker compose up -d --build`.
8. Verify compose status and health endpoints.

No destructive git operations are part of this design. Any dirty server checkout, non-fast-forward pull, or compose failure stops the rollout and becomes the result.

## E2E Design

Use the deployed LAN API and web UI, not local dev services.

API e2e:

1. Create project `E2E Launch Lab 2026-06-02`.
2. Read the created project back from `GET /projects`.
3. Create four paused backlog tasks with `autoMode=false`.
4. Read tasks back from `GET /tasks?projectId=<id>`.
5. Create one comment on the first task to validate a deeper task child route.
6. Read comments back from `GET /tasks/:id/comments`.

Web/perf e2e:

1. Set:
   - `AIF_SKIP_DEV_SERVER=1`
   - `AIF_WEB_URL=http://192.168.88.67`
   - `AIF_API_URL=http://192.168.88.67/api`
2. Run `npm run perf --workspace=@aif/web`.
3. Treat dashboard load and endpoint timing failures as e2e failures unless output clearly identifies a target-independent tool setup issue such as missing browser binaries.

## Project Root Choice

The primary project root sent to API should be `/home/www/e2e-launch-lab-20260602`, because this is the documented container mount and passes local path validation. The host-visible path is `/srv/aif-handoff/projects/e2e-launch-lab-20260602`; if live checks reveal the API expects a host path under `PROJECTS_DIR`, use the documented host path and rely on `mapHostProjectPathToContainer`.

The validation should not create files directly in the project unless API initialization requires manual support. Prefer API-driven creation because it validates the real route and runtime project initialization path.

## Gate Design

- `PLAN PASS` is required before any server probe, SSH, curl to `192.168.88.67`, docker command, git push intended for deployment, or e2e API call.
- `TEST PASS` after deployment must independently verify the health/e2e evidence.
- `REVIEW PASS` after deployment must independently review the final state, changed files, and evidence for deployment safety and scope.

If either post-implementation gate fails, revise the invalidated part and rerun that gate.
