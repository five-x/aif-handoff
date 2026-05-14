# Research: Terminalize Roadmap Audit Plan Quality Exhaustion

Task ID: `work-20260514-terminalize-roadmap-audit-plan-quality-exhaustion`

## Context

Commit `8a2a38d` fixed roadmap audit source-report terminalization for stalled review loops and unchanged artifact rework. After deployment and `retry_from_blocked`, the live `audit-v14` security/configuration source card still returned to `blocked_external`.

## Live Evidence

- Task `ff938276-3e5a-4c97-a67e-35671a95eead` returned to `blocked_external` after retry.
- Final reason: `Plan quality guard (...) Retry limit reached (2). Operator next step: edit the task prompt or plan constraints, then retry from blocked.`
- Timeline shows roadmap source artifact `0742a2b5-905a-4dff-be18-0c8e83c5e93a` with role `report`, artifact path `audit/2026-05-14-audit-security-and-configuration-controls-audit.md`, and state `expected`.
- This is not missing user input: it is generated roadmap source-card planning exhaustion.

## Local Code Findings

- `packages/agent/src/coordinator.ts` handles plan checker failures in `handlePlanQualityFailure()`.
- If `nextRetryCount <= PLAN_QUALITY_MAX_RETRIES`, the task is requeued to `planning`.
- After the retry budget is exhausted, the function always moves the task to `blocked_external`.
- The previous helper `terminalizeRoadmapSourceReportAsInconclusive()` already has the correct artifact/task behavior for generated roadmap `role="report"` cards.

## Root Cause

Generated roadmap source-report cards have the same dual meaning problem at plan-quality exhaustion:

- For ordinary tasks, plan-quality exhaustion means operator intervention.
- For generated roadmap source-report cards, plan-quality exhaustion means this source could not produce a reliable report plan and should become a terminal non-trusted source outcome for synthesis.

The code only implements the ordinary-task path, so one weak generated plan can stop the entire roadmap.

## Scope Boundaries

- Only roadmap batch artifacts with role `report` may terminalize this way.
- Non-roadmap tasks must keep the existing `blocked_external` manual intervention path.
- The plan-quality validator remains strict.
