# Design: Terminalize Roadmap Audit Plan Quality Exhaustion

## Goal

When a generated roadmap audit source-report card exhausts plan-quality replans, complete the source card as `source_inconclusive` instead of blocking the roadmap.

## Non-Goals

- Do not accept invalid plans.
- Do not bypass the plan-quality guard before its existing retry budget.
- Do not change non-roadmap/manual task behavior.
- Do not auto-release synthesis unless all source artifacts are either trusted valid or terminal source outcomes.

## Proposed Change

Extend the existing coordinator terminalization helper:

- Add terminalization reason `plan_quality_exhausted`.
- Call it from `handlePlanQualityFailure()` only after `PLAN_QUALITY_MAX_RETRIES` is exceeded.
- Pass the plan-quality blocked reason, retry count, max retry count, and issue categories into validation details.
- If the task has a persisted roadmap `report` artifact, mark the artifact `source_inconclusive`, record a `terminal_inconclusive` attempt, clear task blocked flags, and set the task to `done`.
- If no report artifact exists, keep the current `blocked_external` fallback.

## Expected Behavior

- `audit-v14` security/configuration source card can finish as non-trusted source input when generated planning repeatedly fails quality checks.
- Roadmap synthesis remains blocked only until every source artifact is valid or terminal source-inconclusive/manual-exception.
- Ordinary tasks still block after plan-quality retry exhaustion.

## Risks

- Risk: terminalizing plan failures may hide systemic planner weakness. Mitigation: artifact attempt details retain categories and blocked reason; synthesis can report incomplete source coverage.
- Risk: a source can become inconclusive before implementation ever creates a report. Mitigation: this path activates only after generated roadmap planning fails the existing retry budget.

## Verification

- Add coordinator test for roadmap source report plan-quality exhaustion terminalizing to `done` and `source_inconclusive`.
- Keep/rename coordinator test proving non-roadmap plan-quality exhaustion still blocks.
- Run focused agent coordinator tests, build, lint, and `git diff --check`.
