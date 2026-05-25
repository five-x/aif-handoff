# Clear Remote botIntevra Dirty Audit Worktree Blocker

- Task ID: work-20260525-clear-remote-botintevra-dirty-audit-worktree
- Lane: work
- Status: done
- Priority: high
- Created: 2026-05-25
- Source: Remote Audit Quality Trust Canary fresh botIntevra attempt `5fd1ace1-ba50-4bc0-b604-56e65c7ca59d`
- RDPI Needed: yes
- RDPI Path: `docs/rdpi/work/work-20260525-clear-remote-botintevra-dirty-audit-worktree`

## Request

Diagnose and safely clear or quarantine the deployed botIntevra project worktree blocker that prevents remote AIF branch isolation from starting audit canary tasks.

The remote canary attempt against project `botIntevra` (`e4a3a101-ec7f-4f93-9b68-e297ffe8952f`) failed before implementation with:

```text
Branch isolation failure (dirty_worktree): Working tree at /home/www/botIntevra has uncommitted changes (?? audit/). Commit, stash, or discard them before continuing.
```

## Done When

- The remote `/home/www/botIntevra` dirty `audit/` state is inspected and classified.
- Any uncommitted audit artifacts are preserved, committed, archived, or otherwise handled according to an explicit operator-safe plan.
- Branch isolation no longer fails on `dirty_worktree` for a narrow remote audit canary.
- The result records the exact remote evidence and avoids relying on local AIF service or local browser checks.

## Constraints

- Do not execute this follow-up from the parent canary task.
- Do not delete or discard remote files without concrete evidence that they are disposable.
- Treat remote audit artifacts as potentially useful evidence until classified.
- Keep this work diagnostic/operational unless a reviewed RDPI plan authorizes a concrete cleanup action.
