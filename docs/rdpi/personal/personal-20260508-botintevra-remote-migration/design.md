# Design

## Chosen design

Use a gated remote-migration design:

1. Discover a safe authenticated file-transfer path to the remote host after `PLAN PASS`.
2. If write access is available, create a transfer snapshot from the local `botIntevra` checkout that includes tracked, modified, and untracked project files but excludes secrets, virtualenvs, caches, build outputs, and transient Python artifacts.
3. Copy the snapshot to the remote host directory intended to back AIF's `/home/www/botIntevra`.
4. Install and validate the Python project on the remote host without starting the Telegram bot or long-running services.
5. Register or reuse an AIF project record pointing to `/home/www/botIntevra`, not the local Windows path.
6. Document remote source-of-truth state, unresolved secrets/data, validation results, rollback, and local decommission steps.
7. Do not delete the local checkout in this run unless remote verification fully passes and the user explicitly approves deletion/archival after seeing the migration result.

This approach reflects the user's correction: the end state should be a remote-host project, not AIF managing the local Windows checkout.

## Pre-PLAN boundary

- Allowed before `PLAN PASS`: read local task card, local guidance, prior RDPI docs, AIF docs, and the local `botIntevra` repository; write planning-only RDPI artifacts.
- Not allowed before `PLAN PASS`: probe `192.168.88.67`, attempt SSH/SCP/SMB, call live AIF API, copy files, create directories on remote, create AIF project records, run remote commands, start services, read secret values, or delete/archive local files.

## Scope boundaries

- In scope:
  - Source migration planning and, if access exists, source transfer.
  - Remote Python install/build/test style validation.
  - AIF project registration against the remote path.
  - Documentation of data/secrets/service ownership.
  - Waiting-state close-out if remote write access or secrets/data are unavailable.
- Out of scope:
  - Fixing `botIntevra` implementation defects such as `run-orchestrator-server` dispatch.
  - Starting the production Telegram bot process.
  - Managing systemd or permanent process supervision unless the remote host already exposes a documented mechanism and the plan is updated through review.
  - Reading or transporting raw secret values through RDPI artifacts or shared memory.
  - Deleting local checkout automatically.

## Failure design

- If no authenticated remote write path exists, stop and mark the task `waiting` with exact access evidence and required user action.
- If remote write access exists but `/home/www` backing path is ambiguous, stop before copying or registering the project.
- If transfer succeeds but remote validation fails, leave copied files in place for inspection, do not register/enable auto-queue, and document rollback cleanup commands rather than deleting remotely without approval.
- If AIF project creation succeeds but verification fails, roll back only the newly created AIF project record with `DELETE /api/projects/:id`; do not delete source files without explicit user approval.
- If local deletion is requested later, require a separate explicit cleanup/retirement step after remote verification.

## Decision candidates

- Full project migrations should treat "remote source of truth verified" and "local checkout decommissioned" as separate gates.
- AIF project records should be created only after the remote path exists and has been validated as the intended repository.
