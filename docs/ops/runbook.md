<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

# Runbook

## Scope

Operational notes, rollout procedures, migration steps, and validation commands for `aif-handoff`.

## Bootstrap Notes

- Runtime files are managed through `codex-bootstrap-repo.py` and `codex-gpti-compile.py`.
- Memory curation runs through `codex-memsync.py`.

## Source Validation

- Build: npm.cmd run build
- Test: npm.cmd test
- Lint: npm.cmd run lint

These commands validate local source code only. They do not validate the deployed AIF service.

## Validation Boundaries

- Deployed service, UI, API, browser, perf, load, canary, audit-quality, and e2e validation must target the remote AIF service at `http://192.168.88.67` with API checks through `http://192.168.88.67/api`.
- Do not start or use a local AIF service, local browser target, local perf target, or local e2e service target for this deployment path unless the operator explicitly authorizes local validation for the current task.
- For Playwright/perf checks, set `AIF_SKIP_DEV_SERVER=1`, `AIF_WEB_URL=http://192.168.88.67`, and `AIF_API_URL=http://192.168.88.67/api`.

## Secrets Boundary

- Keep raw secrets in a dedicated secret layer.
- Shared memory may store only redacted pointers and non-secret operational notes.
