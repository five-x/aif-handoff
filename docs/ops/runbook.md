<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

# Runbook

## Scope

Operational notes, rollout procedures, migration steps, and validation commands for `aif-handoff`.

## Bootstrap Notes

- Runtime files are managed through `codex-bootstrap-repo.py` and `codex-gpti-compile.py`.
- Memory curation runs through `codex-memsync.py`.

## Local Validation

Local commands validate source health only:

- Build: npm.cmd run build
- Test: npm.cmd test
- Lint: npm.cmd run lint
- Run: npm.cmd run dev

## Validation Boundaries

Deployed service, UI, API, browser, perf, load, canary, audit-quality, and e2e validation must target the remote AIF environment unless an RDPI plan or operator decision explicitly waives remote-only validation.

Required remote environment:

```text
AIF_WEB_URL=http://192.168.88.67
AIF_API_URL=http://192.168.88.67/api
AIF_SKIP_DEV_SERVER=1
```

Do not use localhost AIF service checks as acceptance evidence for deployed-service or audit-quality tasks unless the task explicitly scopes validation to local source behavior.

## Secrets Boundary

- Keep raw secrets in a dedicated secret layer.
- Shared memory may store only redacted pointers and non-secret operational notes.
