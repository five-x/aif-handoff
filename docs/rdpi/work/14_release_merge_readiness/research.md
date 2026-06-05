# Research - 14_release_merge_readiness

## Scope

Validation-only release readiness check for branch `codex/roadmap-audit-oom-hardening`.
Runtime/source code changes are out of scope unless a separate blocker requires a follow-up task.

## Inputs

- Task spec: `C:\Users\apron\Desktop\14_release_merge_readiness_tz.md`
- Repo: `five-x/aif-handoff`
- Expected branch: `codex/roadmap-audit-oom-hardening`
- Expected HEAD: `c9ffb36ea16af47bc3a7385938e52fb60a31142b`
- Canary code commit reference: `d783d55388483232b478dde78c7780072454d7b4`
- Required result path: `docs/rdpi/work/14_release_merge_readiness/result.md`

## Local Facts Collected

- RDPI bootstrap: `python "$env:USERPROFILE\.codex\tools\codex-ensure-rdpi.py` returned `STATUS: ready`.
- Current branch: `codex/roadmap-audit-oom-hardening`.
- Current HEAD: `c9ffb36ea16af47bc3a7385938e52fb60a31142b`.
- `origin/codex/roadmap-audit-oom-hardening` matches current HEAD.
- Origin default branch: `main`.
- Merge base with `origin/main`: `0b78db038e6f8880b8c5402b408f1705bc029d11`.
- Commit count in `origin/main..HEAD`: `140`.
- Changed file count in `origin/main...HEAD`: `530`.

## Initial Changed File Classification

- Runtime/source: `69` files.
- Tests: `61` files.
- RDPI docs: `137` files.
- Memory artifacts: `235` files.
- Intake docs: `23` files.
- Other docs/config: `5` files.
- Uncategorized: `0` files.

## Dirty Worktree At Task Start

Pre-existing dirty files were docs/memory and one RDPI result document. No dirty runtime/source files were present before this task's own artifacts.

## GitHub Remote Facts

- Local `gh` CLI was not available.
- GitHub connector combined status for `c9ffb36e...` returned no statuses.
- GitHub connector workflow-run lookup for `c9ffb36e...` returned no PR-triggered workflow runs.
- GitHub connector recent open PR lookup returned no open pull requests for the authenticated user in this repository.

## Evidence Sources To Use

- `git log --oneline --decorate --graph --max-count=80 origin/main..HEAD`
- `git diff --stat origin/main...HEAD`
- `git diff --name-status origin/main...HEAD`
- `git status --short`
- `git diff --name-only`
- `git diff --cached --name-only`
- Required local confidence commands: `npm.cmd test`, `npm.cmd run build`, `npm.cmd run lint`, `git diff --check`
- Existing canary result: `docs/rdpi/work/13_full_canary_suite/result.md`
- Existing canary memsync report: `docs/memory/reports/13_full_canary_suite-memsync-report.md`

## Open Risks

- Branch diff includes many committed `docs/memory/**` artifacts. They must be treated as release contents, not as current dirty files.
- Current worktree has pre-existing dirty `docs/memory/**` files that are not part of HEAD. They should not be staged or cleaned in this task.
- Live remote smoke requires server access plus explicit deploy/smoke approval and a non-conflicting disposable project root. If those conditions are not satisfied, it must be recorded as `SKIPPED`, not `PASS`.
