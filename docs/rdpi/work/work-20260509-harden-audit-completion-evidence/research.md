# Research

Task ID: `work-20260509-harden-audit-completion-evidence`

## Trigger

The live `aif-handoff-01` instance at `192.168.88.67` marked audit task
`039f4514-629f-4bbe-aede-3f2a4c95e7d6` as `done`, but the task did not meet
its own completion criteria.

## Local Evidence

- Completion guard lives in `packages/shared/src/taskCompletionEvidence.ts`.
- `collectChangedFiles()` currently includes `git status --porcelain=v1 --untracked-files=all`.
- `reportArtifactFiles` is derived from that combined changed-file set.
- Therefore an untracked `audit/*.md` file can satisfy the report-artifact guard.
- `packages/agent/src/subagents/implementer.ts` can generate a deterministic
  diagnostic inventory report for diagnostic-only plans and return without
  running a semantic audit worker.
- Existing tests in `packages/shared/src/__tests__/taskCompletionEvidence.test.ts`
  cover missing reports and invalid references, but not the "committed report"
  requirement or deterministic fallback report insufficiency.

## Live Evidence From Server 67

- Task status: `done`.
- Branch: `feature/full-project-audit-across-all-available-039f45`.
- Worktree status on `/srv/aif-handoff/projects/botIntevra`: `?? audit/`.
- Report file exists at `audit/2026-05-09-full-project-audit.md`.
- The report is a deterministic inventory fallback with one informational
  finding, not a full project audit.
- Agent logs include `Saved deterministic diagnostic plan fallback` and
  `Implementer used deterministic diagnostic report fallback`.
- Stable fallback signatures observed in code/live output:
  - implementation/activity marker: `Deterministic diagnostic report generated`
  - report template marker: `Diagnostic-only repository inventory report`
  - report finding marker: `No blocking issue found by deterministic inventory check`
  - report footer marker: `This report records evidence only`

## Conclusion

The guard must fail closed when a task asks for a committed report and the
report artifact is only untracked/dirty. It must also fail closed for broad
audit/review/discovery tasks whose only artifact is the deterministic inventory
fallback report.
