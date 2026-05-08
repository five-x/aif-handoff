<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

# Runbook

## Scope

Operational notes, rollout procedures, migration steps, and validation commands for `aif-handoff`.

## Bootstrap Notes

- Runtime files are managed through `codex-bootstrap-repo.py` and `codex-gpti-compile.py`.
- Memory curation runs through `codex-memsync.py`.

## Local Validation

- Build: npm.cmd run build
- Test: npm.cmd test
- Lint: npm.cmd run lint
- Run: npm.cmd run dev

## Secrets Boundary

- Keep raw secrets in a dedicated secret layer.
- Shared memory may store only redacted pointers and non-secret operational notes.
