# Plan - 14_release_merge_readiness

## Gate Plan

1. Complete local release-range discovery and changed-file classification.
2. Run independent PLAN review before final verification execution.
3. Execute required local confidence commands:
   - `npm.cmd test`
   - `npm.cmd run build`
   - `npm.cmd run lint`
   - `git diff --check`
4. Check remote branch parity and available GitHub CI/PR status.
5. Decide whether live remote smoke conditions are satisfied. If not, record `SKIPPED` with reason.
6. Write `docs/rdpi/work/14_release_merge_readiness/result.md` with verdict, rollback plan, residual risks, and gate outcomes.
7. Run independent TEST/REVIEW gates against the evidence/result artifact.

## Verification Commands

```powershell
python "$env:USERPROFILE\.codex\tools\codex-ensure-rdpi.py"
git status --short
git rev-parse HEAD
git branch --show-current
git remote -v
git fetch origin
git remote show origin
git log --oneline --decorate --graph --max-count=80 origin/main..HEAD
git diff --stat origin/main...HEAD
git diff --name-status origin/main...HEAD
git diff --name-only
git diff --cached --name-only
git rev-parse origin/codex/roadmap-audit-oom-hardening
npm.cmd test
npm.cmd run build
npm.cmd run lint
git diff --check
```

## Acceptance Checks

- Result artifact exists at `docs/rdpi/work/14_release_merge_readiness/result.md`.
- Commit range and file counts are recorded.
- Changed and dirty files are classified.
- Required local confidence commands have exit codes and summaries.
- Full canary suite reference is summarized from task 13.
- Remote branch parity and available CI/PR facts are recorded.
- Optional live remote smoke is either evidenced or honestly skipped.
- Rollback plan is present.
- No runtime/source code is changed by this task.

## Stop Conditions

- Expected branch or HEAD mismatch.
- Required local verification command fails.
- Unexpected dirty runtime/source file appears.
- Required stabilization result artifact is missing.
- Live smoke is attempted and fails a critical health/API check.
