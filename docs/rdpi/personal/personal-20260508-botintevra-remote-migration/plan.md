# Plan

## Implementation plan

1. Run independent plan review on `research.md`, `design.md`, and this plan; require explicit `PLAN PASS`.
2. After `PLAN PASS`, perform non-mutating remote access discovery:
   - confirm AIF API base with `curl.exe -sS --max-time 20 http://192.168.88.67/api/projects`
   - check whether SSH is reachable without prompting: `ssh -o BatchMode=yes -o ConnectTimeout=5 192.168.88.67 true`
   - if an SSH host alias exists locally, inspect it before trying additional SSH commands
   - do not try password-interactive commands
3. If no authenticated remote shell/file-transfer path is available, write `result.md`, set intake status to `waiting`, and stop. Required unblock: user provides SSH/SCP/SMB/RDP/deploy-share access or places the repository under the host path backing `/home/www`.
4. If remote write access is available, identify the remote final path. Preferred AIF path: `/home/www/botIntevra`.
5. Verify the remote parent path maps to the AIF projects mount and does not already contain unrelated data.
6. Build a local transfer manifest:
   - include tracked, modified, and untracked project source/docs/tests/scripts needed for current dirty state
   - exclude `.git`, `.env`, `.env.*`, `.venv`, caches, `__pycache__`, build artifacts, `.pytest_cache`, and editor folders
   - include `data/bot-intevra/**` only if it actually exists and is intentionally selected
7. Transfer the manifest to the remote final path using the confirmed access method.
8. On the remote host, run non-service validation:
   - confirm expected files exist
   - create/activate a virtual environment or use the host Python environment
   - run `python -m pip install -e .`
   - run `python -m compileall src`
   - run `python -m compileall src tests`
   - run `python -m pytest -q` only if pytest is available or install policy allows it
   - run `python -m bot_intevra init-db` only with explicit non-secret env required for initialization; otherwise document as pending secrets/config
9. Register or reuse the AIF project:
   - `GET http://192.168.88.67/api/projects`
   - reuse an existing `botIntevra` project only if it points to the verified remote path
   - otherwise `POST http://192.168.88.67/api/projects` with `name=botIntevra`, `rootPath=/home/www/botIntevra`, `parallelEnabled=false`
   - keep auto-queue disabled
10. Verify AIF registration:

- `GET /api/projects`
- `GET /api/projects/:id/defaults`
- `GET /api/projects/:id/roadmap/status`

11. Write `docs/ops/botintevra-remote-migration.md` and `docs/rdpi/personal/personal-20260508-botintevra-remote-migration/result.md`.
12. Run independent tester gate. Required verdict: `TEST PASS` or `TEST FAIL`.
13. If tester passes, run independent final reviewer gate. Required verdict: `REVIEW PASS` or `REVIEW FAIL`.
14. Run `$memsync MODE=auto LANE=personal TASK_ID=personal-20260508-botintevra-remote-migration` only if the migration successfully completes and local review artifacts pass.
15. Mark the intake status:

- `done` only after successful migration, `TEST PASS`, `REVIEW PASS`, and local memory review success
- `waiting` if blocked on remote access, secret/data location, or remote validation

## Acceptance criteria

- Remote host has an intended `botIntevra` source tree at the verified path, or the task is explicitly `waiting` on remote write access.
- AIF project record points to the remote-host path, not `C:\Users\apron\source\botIntevra`, or the task is explicitly `waiting`.
- Transfer excludes secret files and does not expose secret values in docs or memory.
- Dirty/untracked project files are either transferred or explicitly listed as excluded with rationale.
- Remote validation commands and outcomes are recorded.
- Runtime data/secrets status is explicit: migrated, absent, or pending external provisioning.
- Local checkout is not deleted automatically.

## Verification plan

- For successful migration:
  - remote file listing confirms expected project files
  - remote `python -m compileall src` succeeds
  - remote `python -m compileall src tests` succeeds
  - remote test outcome is recorded
  - AIF `GET /api/projects` contains exactly one intended `botIntevra` record pointing to `/home/www/botIntevra`
  - AIF defaults/roadmap status endpoints return parseable JSON
- For waiting close-out:
  - `result.md` and `docs/ops/botintevra-remote-migration.md` state the concrete blocker
  - no AIF `botIntevra` record is created unless verified and intended
  - no local checkout deletion is performed
  - intake status is `waiting`
- Gate verification:
  - independent tester returns `TEST PASS` only for the actual end state being claimed
  - independent reviewer returns `REVIEW PASS` only if the close-out is truthful and safe

## Reusable patterns

- Treat migration as three separate gates: transfer, remote validation, source-of-truth cutover.
- Never use AIF project creation as a substitute for file transfer.
- Keep local deletion/decommission as a later explicit cleanup step after verified remote ownership.
