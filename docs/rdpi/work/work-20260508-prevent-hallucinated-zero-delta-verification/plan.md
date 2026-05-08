<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

# Plan

## Implementation plan

1. Add a Node-only shared completion evidence module in `packages/shared/src/`.
   - Define a small task input shape, issue codes, and `evaluateTaskCompletionEvidence(...)`.
   - Keep it deterministic: no model calls, no production runtime reads.
   - Export it from `packages/shared/src/index.ts`, but not from `browser.ts`.
2. Evidence checks:
   - detect risky task categories from title, description, tags, and roadmap metadata;
   - detect generic/placeholder plan output such as "Short task", raw `/aif-plan` markers, `</think>`, or empty/too-thin plans;
   - collect git evidence using local `git status --porcelain` and branch/base diff when the project is a git repo;
   - treat plan files as insufficient by themselves; source/test/doc changes can satisfy normal implementation tasks, but diagnostic/audit/review/discovery/gap-analysis tasks require a concrete report artifact;
   - classify report artifacts separately from plan files, using paths such as report/audit/review/discovery docs or persisted task output files that an operator can inspect;
   - extract repo-like path references from plan, implementation log, review comments, and report evidence, then classify missing references under the project root.
3. Agent integration in `packages/agent/src/coordinator.ts`.
   - Before any transition to `done` from the `skipReview` implementer path, run the guard.
   - Before any review-accepted transition to `done`, run the guard.
   - On guard failure, move the task to `blocked_external` with `blockedFromStatus` set to the stage being closed and a concise `Completion evidence guard (...)` reason.
   - Preserve existing branch isolation failures as fail-closed blocked outcomes and surface them as `branch_isolation` rather than letting downstream verification continue.
   - When the guard cannot prove evidence but the task is otherwise plausibly no-code, block with `manual_review_required` instead of silently reaching `done`.
4. API integration in `packages/api/src/services/taskEvents.ts`.
   - Before `approve_done` writes `verified`, run the same guard against the project root/task branch.
   - On guard failure, move the task to `blocked_external` from `done` and return the updated task instead of verifying.
   - If branch restoration or isolation prevents trustworthy evidence collection, keep the task blocked with a `branch_isolation` reason.
   - If the user-facing operation is not an explicit override path and evidence is absent, use `manual_review_required` to explain that a report artifact or accepted manual evidence is needed.
5. Tests.
   - Add unit tests for the pure evidence classifier.
     - risky audit/review/discovery task with source-only or no delta fails `missing_report_artifact`;
     - report-like text with hallucinated repo paths fails `invalid_or_missing_file_references`;
     - branch isolation/manual-review inputs produce distinct issue codes and blocked reason text.
   - Add coordinator tests for:
     - `skipReview=true` plus generic/no-delta task blocks instead of `done`;
     - audit/review task with no concrete report artifact blocks instead of `done`;
     - branch-isolation/manual-review guard failures expose clear blocked reasons;
     - normal simple skip-review task without risk signals still reaches `done`.
   - Add API task-event tests for:
     - `approve_done` blocks a risky no-delta task instead of `verified`;
     - `approve_done` blocks an audit/review task that has no report artifact or only invalid file references;
     - branch isolation/manual-review outcomes are returned as blocked reasons;
     - existing simple `approve_done` still verifies.
6. Documentation/comments.
   - Add only focused code comments where the guard decision would otherwise be hard to understand.

## Acceptance criteria

- Risky diagnostic/generic tasks cannot move to `verified` or `done` without meaningful evidence.
- Review/audit/discovery/gap-analysis tasks need a concrete inspectable report artifact with valid repo references before completion.
- The blocked reason distinguishes zero delta, generic plan, invalid/missing file references, missing report artifact, branch isolation, and manual review required.
- Existing normal fast/simple tasks still pass existing tests.
- No database migration is required.
- No follow-up implementation task is created or executed by this run.

## Verification plan

- Independent `PLAN PASS` before code changes.
- Focused tests:
  - `npm.cmd test --workspace @aif/shared -- taskCompletionEvidence`
  - `npm.cmd test --workspace @aif/agent -- coordinator`
  - `npm.cmd test --workspace @aif/api -- tasks`
- Broader validation when feasible:
  - `npm.cmd run build`
  - `npm.cmd run ai:validate`
- Independent `TEST PASS` after local verification.
- Independent `REVIEW PASS` before close-out.

## Reusable patterns

- Completion gates should validate evidence provenance and artifact delta before terminal states, especially when the prior stage was model-generated.
