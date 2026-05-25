# Research

## Task framing and lane

- Task: `work-20260525-clear-remote-botintevra-dirty-audit-worktree`.
- Lane: work.
- Goal: diagnose and safely clear the deployed botIntevra dirty worktree blocker that prevents remote AIF branch isolation.
- Current blocker from remote AIF task `5fd1ace1-ba50-4bc0-b604-56e65c7ca59d`: `/home/www/botIntevra` has uncommitted `?? audit/`.

## Accepted planning sources

- Task card: `docs/intake/work/work-20260525-clear-remote-botintevra-dirty-audit-worktree.md`.
- Parent canary result: `docs/rdpi/work/work-20260525-remote-audit-quality-trust-canary/result.md`.
- Remote-only service rule in `packages/web/e2e/README.md` and `docs/ops/runbook.md`.
- Local memory artifacts already in repo that identify botIntevra as an AIF project at `/home/www/botIntevra`.

## Scope boundaries

- Allowed after plan pass: remote readonly inspection of `/home/www/botIntevra`; remote preservation of uncommitted `audit/` artifacts; remote git status verification; remote AIF API task verification against `192.168.88.67`.
- Not allowed: deleting or discarding remote files without preserving them first.
- Not allowed: local AIF service, loopback browser target, or local e2e validation.
- Not allowed: changing botIntevra application code.

## Open questions

- Whether the dirty `audit/` directory contains only generated failed-canary artifacts or other operator-owned audit evidence.
- Whether the safest preservation action is `git stash -u` in the botIntevra repository or a timestamped archive copy outside the worktree.

## Hypotheses

- H1: `audit/` contains generated artifacts from failed canary attempts and can be preserved outside the worktree or in a stash without losing evidence.
- H2: Once `audit/` is preserved and removed from the worktree, branch isolation will stop failing with `dirty_worktree`.
- H3: A narrow remote canary may still intentionally end as `blocked_external` for weak audit evidence; that is acceptable if it gets past branch isolation.
