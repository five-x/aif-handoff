# Plan

## Implementation plan

1. Run independent plan review on `research.md`, `design.md`, and this plan; require an explicit `PLAN PASS`.
2. After `PLAN PASS`, record boundary accounting before implementation:
   - `git status --short -- AGENTS.md AGENTS.md.bak.20260507204903 docs/intake docs/rdpi docs/ops docs/memory docs/kb`
   - summarize that `codex-ensure-rdpi.py` refreshed managed guidance and did not perform `botIntevra` transfer implementation.
3. Capture pre-onboarding target initialization state:
   - whether `C:\Users\apron\source\botIntevra\.ai-factory` exists
   - `git -C C:\Users\apron\source\botIntevra status --short -- .ai-factory`
4. Perform live AIF checks:
   - `GET http://192.168.88.67/agent/readiness`
   - `GET http://192.168.88.67/projects`
5. If a matching project already exists by name/root path, reuse it.
6. If no matching project exists, create it through `POST http://192.168.88.67/projects` with:
   - `name`: `botIntevra`
   - `rootPath`: `C:\Users\apron\source\botIntevra`
   - `parallelEnabled`: `false`
7. Verify with `GET /projects` that exactly one intended `botIntevra` project is visible and capture its `id`, `name`, `rootPath`, `parallelEnabled`, and `autoQueueMode`.
8. Run project-root visibility checks:
   - `GET http://192.168.88.67/projects/:id/defaults`
   - `GET http://192.168.88.67/projects/:id/roadmap/status`
   - If the project was newly created, record whether `POST /projects` returned `201` and therefore completed API path validation plus `initProject()`.
   - If the project was reused and these checks do not confirm useful path/config visibility, record path accessibility as unresolved and do not mark that acceptance criterion satisfied.
9. Capture post-onboarding target initialization state:
   - whether `C:\Users\apron\source\botIntevra\.ai-factory` exists
   - `git -C C:\Users\apron\source\botIntevra status --short -- .ai-factory`
   - exact created/modified target paths, if any
10. If this run created a project record and subsequent verification fails, roll back the AIF record with `DELETE http://192.168.88.67/projects/:id`; do not delete target repo files without an explicit cleanup request.
11. Write `docs/ops/botintevra-aif-onboarding.md` with:

- selected AIF URL
- project id/root path
- whether the server mapped the Windows path to a container path
- path accessibility status and evidence limits
- initial runtime/auto-queue posture
- secrets boundary
- transfer risks and rollback
- queued follow-up recommendations, without executing those follow-ups

12. Create `docs/rdpi/personal/personal-20260507-botintevra-aif-transfer/result.md` with gate outcomes, live evidence summary, implementation result, rollback status, and memory-sync status placeholder.
13. Run independent tester gate. Required verdict: `TEST PASS`.
14. Run independent final review gate. Required verdict: `REVIEW PASS`.
15. Run `$memsync MODE=auto LANE=personal TASK_ID=personal-20260507-botintevra-aif-transfer`.
16. If local memory review succeeds, update only `docs/intake/personal_status.json` entry status to `done`; if implementation is blocked, set status to `waiting` instead and do not mark done.

## Acceptance criteria

- AIF at `http://192.168.88.67/` has exactly one intended visible project record for `botIntevra`, or the task is explicitly blocked with the API/path/mount reason.
- For newly created projects, project creation returned success after API path validation and `initProject()`; for reused projects, path/config visibility is either confirmed by non-mutating checks or explicitly recorded as unresolved.
- Auto-queue remains disabled initially unless the user explicitly asks to enable it.
- No secret values are written to repository docs, RDPI artifacts, shared memory, or shell output.
- `docs/ops/botintevra-aif-onboarding.md` records the actual result and operational next steps.
- Any `botIntevra\.ai-factory` side effects are recorded with exact paths and rollback guidance.
- RDPI `result.md` records `PLAN PASS`, `TEST PASS`, `REVIEW PASS`, or the exact failing gate.
- Intake status is updated only after the required gates and local memory review rules are satisfied.

## Verification plan

- API verification:
  - Confirm `GET /agent/readiness` returns a parseable response.
  - Confirm `GET /projects` returns a parseable list.
  - Confirm the selected/created project appears in `GET /projects` with expected name and root path.
  - Confirm `GET /projects/:id/defaults` returns parseable config defaults.
  - Confirm `GET /projects/:id/roadmap/status` returns a parseable response and record whether `exists` is true or false.
- File verification:
  - Confirm `docs/ops/botintevra-aif-onboarding.md` exists.
  - Confirm `docs/rdpi/personal/personal-20260507-botintevra-aif-transfer/result.md` exists after implementation.
  - Confirm no `docs/rdpi/<task-id>/` bare directory was created.
- Git/worktree verification:
  - Confirm changes are limited to managed preflight guidance artifacts, this task's RDPI/result/memory/status artifacts, the onboarding operations note, and recorded `.ai-factory` files created by AIF project initialization in the target repo.
  - Confirm no target-repo cleanup was performed without explicit user request.
- Gate verification:
  - Independent tester reports `TEST PASS` or `TEST FAIL`.
  - Independent reviewer reports `REVIEW PASS` or `REVIEW FAIL`.

## Reusable patterns

- For AIF project onboarding, use public APIs and idempotent matching before mutation.
- Keep auto-queue disabled for first registration of dirty or externally mounted projects.
- Treat path/mount verification as a first-class acceptance criterion because AIF agents run from the stored `rootPath`.
