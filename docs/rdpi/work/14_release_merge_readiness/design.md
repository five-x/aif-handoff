# Design - 14_release_merge_readiness

## Approach

Produce a read-only release readiness document from local git, local verification commands, GitHub read-only checks, and the existing canary closeout artifact.

The only intended file writes are RDPI documents under:

```text
docs/rdpi/work/14_release_merge_readiness/
```

No runtime/source, tests, production config, server config, or memory artifacts will be modified.

## Verdict Model

Use one of:

- `READY_TO_MERGE`
- `READY_WITH_NOTES`
- `BLOCKED`

`READY_TO_MERGE` requires expected branch/HEAD, local confidence pass, no unexpected dirty runtime/source files, required stabilization artifacts present, canary reference PASS, and rollback plan.

`READY_WITH_NOTES` allows non-blocking notes such as no CI configured/found, live remote smoke skipped by scope/access/approval, known lint warning with exit code 0, and harmless pre-existing dirty docs/memory files.

`BLOCKED` is required for branch/HEAD mismatch, failed required commands, unexpected dirty source files, missing required result artifacts, canary mismatch, or a failed attempted live smoke.

## Classification Rules

- Runtime/source: `.docker/**` and `packages/*/src/**` excluding `__tests__`, `.test.*`, and `.spec.*`.
- Tests: paths under `__tests__`, files matching `.test.*` or `.spec.*`, and API perf test files.
- RDPI docs: `docs/rdpi/**`.
- Memory artifacts: `docs/memory/**`.
- Intake docs: `docs/intake/**`.
- Other docs/config: remaining `docs/**` paths.
- Dirty unrelated: dirty files present outside this task's RDPI directory.

## Live Remote Smoke Decision

The full remote smoke requires mutable server operations: fast-forward pull, Docker rebuild, and disposable API data creation. It will be skipped unless all task conditions are satisfied:

- server shell access is available;
- deployed commit is clear;
- operator approval covers deploy/smoke mutation;
- disposable root is known to be safe.

If skipped, `result.md` records a concrete reason and does not claim remote PASS.

## Rollback Design

The rollback plan records:

- rollback target / previous deployed commit if known;
- current release commit;
- server path `/opt/aif-handoff`;
- fast rollback commands;
- health checks;
- migration/data and user-visible risks.

Because this readiness task does not perform a server deploy, previous deployed commit may remain unknown unless read-only server evidence is available.
