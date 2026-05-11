# Design - Harden Audit Runtime Quality Contract

## Goals

- Enforce typed audit report-only deltas at completion time.
- Prevent legacy review fallback from turning advisory-only review output into forced rework/manual review.
- Keep the fix platform-wide for any audited project, without special-casing `botIntevra`.

## Non-goals

- Do not edit the registered `botIntevra` project or its audit cards.
- Do not weaken external/runtime failure handling by pretending provider outages are valid audit artifacts.
- Do not remove the manual-review state entirely; keep it for unresolved blockers, malformed convergence after real blockers, and evidence that cannot be proven.

## Contract Changes

### 1. Report-Only Delta Guard

For risky audit/review/discovery tasks that declare an expected report artifact, completion evidence should compute `unexpectedNonReportChangedFiles`:

- Include committed or dirty meaningful files that are not the expected report artifact.
- Keep existing exclusions for plan artifacts and metadata-only paths.
- Fail with a new issue code such as `unexpected_non_report_changes`.
- Map that issue to `invalid_artifact_content` for audit batch artifacts.

This turns "the model edited `AGENTS.md` while creating an audit report" into a deterministic artifact failure, independent of reviewer behavior.

### 2. Deterministic Legacy Review Parsing

Before calling the model-based legacy fallback in `reviewGate.ts`, parse legacy review markdown sections:

- Find `## Blocking Findings` sections.
- Collect bullet lines until the next heading.
- Treat empty sections or `- none` as no blockers.
- Treat non-empty, non-none bullets as blocking findings.
- If at least one blocking section exists, use this deterministic result and do not call the fallback model.

This preserves rework for real blocking findings, but lets advisory-only code/security reviews pass to completion evidence.

### 3. Evidence Repair Prompt Tightening

Keep this as a small supporting change in `implementer.ts`:

- In audit evidence repair mode, explicitly require a bounded single repair transaction: read the current report, inspect cited repo files/commands, rewrite only the expected report artifact, commit once if changed, verify with `git log -1 --name-only --oneline -- <report>`, then stop.
- State that repeated `git_commit` attempts without staged report changes are a failure.

The deterministic guards still decide pass/fail; the prompt change only reduces avoidable Qwen tool loops.

### 4. Report-Only Commit Prompt

Keep the generic commit workflow unchanged for normal implementation tasks, but when `runCommitQuery` is invoked for a risky audit/review/discovery task with a declared expected report artifact:

- Tell the runtime to stage only that report artifact.
- Tell the runtime to inspect other changed files but not stage them.
- Keep the current `git add -A` prompt for tasks without an expected report artifact.

This makes the commit workflow align with the completion guard instead of relying on the guard to catch a bad broad commit after the fact.

## Risk Analysis

- The report-only guard may fail existing audit tasks that previously slipped through with extra source/config edits. That is intended for diagnostic audit cards because the declared contract says report-only.
- Legacy parser must not silently accept malformed output with no blocking sections. If no `Blocking Findings` section is present, keep the existing fallback model behavior.
- Manual review remains available for true unresolved review convergence problems.
- Report-only commit prompts must not break generic commit requests, because implementation tasks still need to stage multi-file source/test changes.

## Acceptance Criteria

- Audit completion fails when a declared report artifact is committed together with `AGENTS.md` or any other non-report meaningful file.
- Audit completion still passes for a clean committed report artifact with substantive evidence and required tool activity.
- Legacy review comments with `Blocking Findings` sections containing only `none` and advisory sections do not trigger rework/manual review when the report artifact is otherwise substantive.
- Legacy review comments with real bullets under `Blocking Findings` still request changes.
- The implementer repair prompt names the expected report artifact and reinforces bounded report-only repair.
- Commit prompts for risky report-artifact tasks stage only the expected report artifact, while generic commit prompts still stage all changes.
