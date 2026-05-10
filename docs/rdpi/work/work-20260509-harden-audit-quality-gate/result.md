# Result: Harden Audit Quality Gate

Task: `work-20260509-harden-audit-quality-gate`
Lane: `work`
Date: 2026-05-09

## Outcome

Implemented the audit-quality hardening approved in `plan.md`.

Risky audit/review/discovery completion now fails closed when the report only proves that a task ran, a tool was used, or a report exists. Completion for those tasks now requires substantive report evidence and review-stage repository inspection activity. The auto-review fallback path no longer accepts risky output without substantive review evidence.

## Code Changes

- `packages/shared/src/taskCompletionEvidence.ts`
  - Added `missing_review_tool_activity` and `insufficient_report_evidence`.
  - Added `reviewStageToolActivityCount` and `substantiveReportEvidence` to collected evidence.
  - Added substantive report evidence checks for exact path/line references, symbol references tied to existing paths, command-output evidence, and structured `Evidence` / `Risk` / `Verification` sections.
  - Validated exact path/line references against existing file line counts.
  - Rejected circular report/runtime-mechanics evidence even when the line also says `verified` or `validated`.
  - Excluded report-artifact self-references from substantive evidence.
  - Counted review-stage activity only while `review-sidecar`, `security-sidecar`, `aif-review`, `aif-security-checklist`, or `review-gate` is active.
  - Counted only repository read/search/inspection tools for review-stage activity.
  - Rejected mutating shell forms before the read-only shell allowlist, including redirection, pipelines, shell separators, command substitution, `find -delete`, `find -exec`, `sed -i`, and `git --output`.
- `packages/shared/src/index.ts`
  - Exported `hasSubstantiveReportEvidence`, `isRiskyTask`, and `TaskCompletionEvidenceTask`.
- `packages/agent/src/reviewGate.ts`
  - Passed task context into review-gate decisions.
  - Added fail-closed handling for risky structured or fallback success without substantive review evidence.
- `packages/agent/src/autoReviewHandler.ts`
  - Passes the refreshed task into `evaluateReviewCommentsForAutoMode`.
- `packages/agent/src/reviewContract.ts`
  - Parses only the canonical structured review summary before embedded raw sidecar sections, preventing raw repeated headings from forcing fallback parsing.
- `packages/agent/src/subagents/reviewer.ts`
  - Review sidecars are instructed to remain read-only.
  - Audit/review/discovery/report-style reviews must inspect the repository with tools and include concrete file/line, function/symbol, or command-output evidence.
- Tests updated in:
  - `packages/shared/src/__tests__/taskCompletionEvidence.test.ts`
  - `packages/agent/src/__tests__/reviewGate.test.ts`
  - `packages/agent/src/__tests__/autoReviewHandler.test.ts`

## Local Verification

Commands run locally, all exit code 0:

- `npm.cmd test --workspace=@aif/shared -- --run src/__tests__/taskCompletionEvidence.test.ts`
  - Final focused shared suite: 36 tests passed.
- `npm.cmd test --workspace=@aif/agent -- --run src/__tests__/reviewGate.test.ts src/__tests__/autoReviewHandler.test.ts`
  - Focused agent suites: 17 tests passed.
- `npm.cmd test --workspace=@aif/shared -- --run --reporter verbose`
  - Full shared suite: 247 tests passed.
- `npm.cmd run build`
  - Turbo build: `7 successful, 7 total`.
- `npm.cmd run lint`
  - Turbo lint: `10 successful, 10 total`.
- `npm.cmd test`
  - Full workspace test suite completed successfully after rerun.

Notes:

- One full `npm.cmd test` run failed inside `@aif/shared` with truncated output, but the isolated full shared suite immediately passed, and a full workspace rerun passed. No code change was made for that transient failure.
- Non-blocking warning: no repo-local `turbo`; commands used global `turbo 2.9.6`.

## Live Deployment

Target: server 67 (`192.168.88.67`)

Deployment actions:

- Copied scoped source/test changes into `/opt/aif-handoff`.
- Rebuilt and restarted `api`, `agent`, and `mcp`.
- Rebuilt and restarted `agent` after the structured parser and read-only reviewer prompt fixes.
- Rebuilt and restarted `api`, `agent`, and `mcp` again after the final shell-parser hardening.

Final health checks after the last deploy:

- `http://192.168.88.67/api/health` returned `{"status":"ok"}`.
- `http://192.168.88.67:3100/health` returned `{"status":"ok"}`.
- `docker compose ps api agent mcp` showed all three containers up.

## Retired Weak Canary

Old weak canary:

- Task id: `6c10a354-13e6-4495-a350-044d764a1329`
- Report path: `audit/2026-05-09-aif-runtime-canary-audit.md`
- Branch: `feature/audit-canary-verify-tool-backed-executio-6c10a3`

Retirement evidence:

- Deleted task `6c10a354-13e6-4495-a350-044d764a1329` from the live task list.
- Deleted branch `feature/audit-canary-verify-tool-backed-executio-6c10a3` on the botIntevra workspace.
- Confirmed `/srv/aif-handoff/projects/botIntevra` is on `main`.
- Confirmed `audit/2026-05-09-aif-runtime-canary-audit.md` is absent on `main`.

## Negative Canary

Task id: `33dd20db-b160-4fe0-93c0-5c24c617b28f`

Report path:

- `audit/2026-05-09-negative-quality-canary.md`

Final task state:

- `status`: `blocked_external`
- `manualReviewRequired`: `true`
- `branchName`: `feature/negative-quality-canary-circular-audit-r-33dd20`

Block evidence:

```text
Completion evidence guard (missing_review_tool_activity, insufficient_report_evidence, manual_review_required): Audit/review/discovery tasks require repository tool activity during review-sidecar, security-sidecar, aif-review, aif-security-checklist, or review-gate validation. Audit/review/discovery report artifact lacks substantive evidence markers such as path+line references, symbol references tied to files, command output, or structured findings with evidence/risk/verification. Manual review is required before this task can be verified without stronger evidence.
```

Negative report content was intentionally circular:

- It said the task executed.
- It said repository tools were used.
- It cited only the report artifact path.
- It explicitly omitted concrete source paths, functions, symbols, and command output.

Tool activity evidence:

- Implementation stage used tools to read the plan, write `audit/2026-05-09-negative-quality-canary.md`, and commit it.
- Review sidecars ran but did not produce repository tool activity under the review-stage counter in this run.
- Review gate moved to manual review, and the completion evidence guard blocked terminal transition.

## Positive Canary

Task id: `808a65c3-7c33-4ade-9a26-c9ff15f58ddd`

Report path:

- `audit/2026-05-09-positive-quality-canary.md`

Final task state:

- `status`: `verified`
- `manualReviewRequired`: `false`
- `branchName`: `feature/positive-quality-canary-substantive-audi-808a65`

Accepted report evidence:

- `README.md:1`
- `AGENTS.md:1`
- `pyproject.toml:3`
- `tests/test_bot.py:1`
- Structured sections with `Evidence`, `Risk`, and `Verification`.
- Verification command and observed output included in the report.

Review evidence:

- Review comments were accepted with `parser=structured`.
- Review-stage activity included repository tool calls such as reading:
  - `audit/2026-05-09-positive-quality-canary.md`
  - `README.md`
  - `AGENTS.md`
  - `pyproject.toml`
  - `tests/test_bot.py`
- Final review comments included concrete evidence:
  - `README.md:1`
  - `pyproject.toml:3`
  - `test_bot.py:1`
  - `2026-05-09-positive-quality-canary.md:3`

Important live iterations:

- First positive attempt timed out during implementation after creating a committed report.
- Parser fix was added because raw embedded sidecar headings forced fallback parsing.
- Read-only reviewer prompt was added because a review sidecar wrote into the report, and the completion guard correctly blocked the uncommitted report artifact.
- After parser and reviewer prompt fixes, the positive canary moved to `done`.
- `approve_done` then moved the task to `verified`, proving API approval also passed the completion guard.

## Independent Gates

- PLAN PASS: independent plan reviewer accepted `research.md`, `design.md`, and `plan.md`.
- First TEST PASS: independent tester reran focused shared/agent tests and build, inspected code and RDPI artifacts, and returned `TEST PASS`.
- First REVIEW FAIL: reviewer found that review-stage activity counted any tool line, including mutating tools, and that report evidence accepted impossible path/line refs and circular claims rescued by `verified` / `validated`.
- Remediation 1: review-stage activity now counts only read/search/inspection tool lines; report evidence validates exact line refs and rejects circular runtime-mechanics claims.
- Second TEST PASS: independent tester reran focused shared/agent tests, build, lint, full workspace tests, and live API/MCP health checks.
- Second REVIEW FAIL: reviewer found read-like shell commands could still be mutating through destructive flags, redirection, or PowerShell write forms.
- Remediation 2: shell command classification now rejects mutation-risk syntax before applying the read-only allowlist and includes targeted tests for both blocked and accepted shell forms.
- Final TEST PASS: independent tester reran focused shared/agent tests, build, lint, full workspace tests, and live API/MCP health checks after the final deploy.
- Final REVIEW PASS: independent reviewer verified the prior fail points and found no blocking issues.

## Final Live Workspace State

After live validation:

- `/srv/aif-handoff/projects/botIntevra` was restored to branch `main`.
- `git status --short` in the live workspace returned no changes.
- Old weak canary report was absent from `main`.
- Superseded timeout-only positive canary task `725339d7-8057-42ce-b66e-f7ef4892aa10` was deleted from the live task list.

## Memory Sync

`memsync MODE=auto` completed local review artifacts and skipped publish because there were no publishable curated documents.

Generated docs:

- `docs/memory/tasks/work/work-20260509-harden-audit-quality-gate-delta.md`
- `docs/memory/projects/aif-handoff/capsule.md`
- `docs/memory/entities/aif-handoff/capsule.md`
- `docs/memory/reports/work-20260509-harden-audit-quality-gate-memsync-report.md`

Publish result:

- `SKIP auto publish: no publishable curated documents`
