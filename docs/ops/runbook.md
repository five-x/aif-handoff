<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

# Runbook

## Scope

Operational notes, rollout procedures, migration steps, and validation commands for `aif-handoff`.

## Bootstrap Notes

- Runtime files are managed through `codex-bootstrap-repo.py` and `codex-gpti-compile.py`.
- Memory curation runs through `codex-memsync.py`.

## Validation Boundaries

- Source-level build, lint, and unit test commands may run in the local checkout:
  - Build: `npm.cmd run build`
  - Test: `npm.cmd test`
  - Lint: `npm.cmd run lint`
- Do not start local AIF services or use localhost/browser e2e checks for this deployment.
- Service, UI, API, canary, audit-quality, and e2e validation must target the remote AIF service:
  - UI: `http://192.168.88.67/`
  - API: `http://192.168.88.67/api`
- The model runtime host is separate (`192.168.88.62`). Do not classify AIF timeouts as host crash/OOM/reset without OS/service evidence from that host; endpoint `8003` / `8005` backpressure should first be diagnosed through AIF queue, timeout, cancel, and profile-accounting logs.

## Secrets Boundary

- Keep raw secrets in a dedicated secret layer.
- Shared memory may store only redacted pointers and non-secret operational notes.
