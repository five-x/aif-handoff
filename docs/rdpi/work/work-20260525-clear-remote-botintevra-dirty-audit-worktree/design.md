# Design

## Approach

Use an operator-safe quarantine workflow:

1. Read remote state only:
   - confirm SSH access to `ubuntu@192.168.88.67`;
   - inspect `/home/www/botIntevra`;
   - capture `git status --short`, `git rev-parse --show-toplevel`, and the file inventory under `audit/`.
2. Classify dirty artifacts:
   - if `audit/` contains generated canary/report artifacts, preserve them first;
   - if files look operator-authored or unrelated, stop and report.
3. Preserve before cleanup:
   - prefer a timestamped archive/copy outside the git worktree, under a clearly named backup path;
   - optionally use `git stash push -u -- audit` only if it preserves all untracked files and leaves a readable stash entry.
4. Clear the working copy:
   - remove only the already-preserved untracked `audit/` directory from `/home/www/botIntevra`;
   - do not touch tracked files or unrelated untracked files.
5. Verify:
   - `git status --short` in `/home/www/botIntevra` is clean;
   - remote AIF task execution no longer fails with `dirty_worktree`;
   - if a new negative canary blocks on audit-quality evidence, classify that as expected fail-closed behavior, not a branch-isolation blocker.

## Safety properties

- Evidence is preserved before cleanup.
- Cleanup is path-scoped to `/home/www/botIntevra/audit`.
- No local AIF service or loopback validation is used.
- The result records exact remote commands and outcomes.

## Rollback

- If removing `audit/` causes an operator issue, restore it from the timestamped backup path or the git stash entry recorded in `result.md`.
