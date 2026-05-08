# Design

## Chosen design

- Perform a minimal, idempotent AIF onboarding:
  1. After `PLAN PASS`, query the live AIF API at `http://192.168.88.67/` for readiness and existing projects.
  2. Reuse an existing `botIntevra` project record if one already points to `C:\Users\apron\source\botIntevra`, `/home/www/botIntevra`, or an equivalent normalized root.
  3. Otherwise create one project named `botIntevra` with root path `C:\Users\apron\source\botIntevra`, `parallelEnabled=false`, and no project-specific runtime overrides.
  4. Leave auto-queue disabled for first onboarding because the target repo is dirty and AIF branch-isolated parallel work depends on server worktree configuration.
  5. For a newly created project, treat `POST /projects` success as the primary path-access signal because the API runs path validation and project initialization before returning `201`.
  6. For either a new or reused project, run non-mutating API checks against the returned id: `GET /projects/:id/defaults` and `GET /projects/:id/roadmap/status`. If these checks cannot establish useful path/config visibility, record path accessibility as unresolved instead of claiming it is proven.
  7. Capture target-repo `.ai-factory` state before and after onboarding so any initialization side effects are explicit.
  8. Write a concise local operations note in `docs/ops/botintevra-aif-onboarding.md` with the observed result, the management URL, risks, rollback, and recommended follow-up tasks.

This design directly satisfies the user's goal of managing `botIntevra` from `http://192.168.88.67/` while keeping higher-risk process orchestration, secret handling, and code fixes out of the first transfer step.

## Pre-PLAN boundary

- Allowed before `PLAN PASS`: read task card, local instructions, local docs/source, and write planning-only RDPI artifacts.
- Not allowed before `PLAN PASS`: probe `http://192.168.88.67/`, call live AIF APIs, inspect runtime logs, check scheduler state, query shared memory, create AIF project records, edit `botIntevra`, or start services.

## Scope boundaries

- In scope:
  - Register or reuse an AIF project record for `botIntevra`.
  - Validate project visibility from the AIF API.
  - Document exact onboarding result and remaining risks.
  - Create only this task's RDPI/result/memory artifacts in `aif-handoff`.
- Out of scope:
  - Fix `botIntevra` CLI bugs.
  - Start or supervise the Telegram bot process.
  - Move secret values into files or shared memory.
  - Enable auto-queue or parallel execution before the dirty worktree and mount/worktree setup are intentionally handled.
  - Create and execute child implementation tasks in the same run.

## Failure design

- If `http://192.168.88.67/` is unreachable or does not expose the expected API, stop implementation and mark this task waiting with the concrete blocker.
- If `POST /projects` fails because the server cannot access or validate the root path, do not force a record by editing the DB. Document the needed server-side mount/path correction.
- If a matching project already exists, do not create a duplicate. Record the existing project id and root path instead.
- If project creation succeeds but later verification fails, treat that as `TEST FAIL` and do not mark the intake task done.
- If this run creates the AIF project record and then verification fails, delete only that newly created AIF project record through `DELETE /projects/:id` as rollback. Do not delete pre-existing project records.
- If AIF initialization creates `C:\Users\apron\source\botIntevra\.ai-factory\**`, record the exact paths. Do not recursively delete target-repo files without an explicit user cleanup request; instead document the cleanup command and mark the task waiting if those files must be removed.

## Decision candidates

- Initial AIF onboarding for externally hosted/local-service projects should default to `parallelEnabled=false` and auto-queue disabled until the project root mount, branch/worktree policy, and secrets model are verified.
- AIF project records should be created through the public API rather than direct SQLite mutation, because `POST /projects` runs path validation, host-to-container path mapping, and project initialization.
