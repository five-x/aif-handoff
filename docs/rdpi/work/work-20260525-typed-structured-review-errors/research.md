# Typed Structured Review Errors Research

## Task Framing And Lane

- Task ID: `work-20260525-typed-structured-review-errors`
- Lane: `work`
- Intake source: `docs/intake/work/work-20260525-typed-structured-review-errors.md`
- RDPI needed: yes
- Goal: replace null/ambiguous structured review parser failures with typed parse-error results that carry stable issue codes and deterministic fingerprints.
- Required behavior: malformed structured review output must remain fail-closed, first occurrence should route to rework with exact repair instructions, and a repeated same fingerprint should route to manual block or operator input instead of generic retry churn.
- Explicit constraints: do not weaken review gate fail-closed behavior; do not treat malformed structured review output as pass; do not run local AIF service, browser, local e2e checks, or runtime endpoint checks.

## Accepted Planning Sources Or Local Facts

- `AGENTS.md` and the user-provided repository instructions require RDPI for non-trivial work and independent plan, test, and review gates.
- `packages/agent/src/reviewContract.ts` owns structured review parsing and formatting:
  - `parseStructuredSidecarOutput` currently returns `ParsedStructuredSidecarOutput | null` for code/security sidecar output.
  - `parseSpecializedRoleOutput` currently returns `ParsedSpecializedRoleOutput | null` and already detects verdict problems, pass-with-blockers, inconclusive output, and pass-without-concrete-evidence, but collapses all of them to `null`.
  - `parseStructuredReviewComments` currently returns `ParsedStructuredReviewComments | null`; missing sections, malformed rows, invalid metadata, duplicate security coverage, and malformed previous finding rows all become `null`.
  - `collectSections` uses a `Map`, so duplicate section headings are silently merged instead of being reason-coded.
- `packages/agent/src/reviewGate.ts` owns auto review gate routing:
  - `evaluateReviewCommentsForAutoMode` tries structured parsing first, then treats structured-looking parse failure as `malformed_structured_review_contract`.
  - Existing malformed structured output currently routes to `manual_review_required`, not first-attempt rework.
  - Existing finding enrichment assigns stable IDs and increments `streak` for repeated finding IDs; `autoReviewHandler.ts` uses stalled finding streaks to stop retry churn.
  - Missing or mismatched previous finding coverage is currently detected after parse success by `parsedPreviousFindingsMatchInput` and routes through a generic handoff path.
- `packages/agent/src/subagents/reviewer.ts` builds reviewer-side structured review comments and fallback contract-failure comments. Its parser callers must keep working if typed parse APIs are added.
- `packages/shared/src/types.ts` defines `AutoReviewFinding` and `AutoReviewState`. Findings already support stable IDs, status, closure evidence, and streak metadata; adding parse diagnostics to finding text can avoid broad persistence schema changes.
- `packages/agent/src/__tests__/reviewContract.test.ts` already covers null-return behavior for missing Security Coverage, duplicate Security Coverage, pass-with-blockers, pass-without-evidence, and missing Previous Findings. These tests need to shift toward typed parse-error assertions.
- `packages/agent/src/__tests__/reviewGate.test.ts` already covers fail-closed malformed structured review comments and existing streak behavior. It is the right place for first malformed rework versus repeated same fingerprint routing.

## Same-Project Memory

- Local curated memory `docs/memory/decisions/decision-fcf5f9fd370337ae.md` records the project decision that repeated same blocker reaches `stalled_rework_loop` before max-review exhaustion.
- Local curated memory `docs/memory/decisions/decision-6d557d264618c58b.md` records that stalled finding details should be operator-facing in comments.
- `docs/ops/plan-b-v13-audit-runbook.md` says `stalled_rework_loop` means repeated review cycles hit the same blocker and the card is terminalized with manual review required and preserved diagnostics.
- These facts support reusing existing stable finding/streak machinery for repeated parse-error fingerprints instead of adding a separate retry counter.

## Cross-Project Reusable Patterns

- No cross-project reusable memory was needed. The implementation surface and retry behavior are project-local.

## Rejected Or Stale Memory Candidates

- No shared-memory recall was performed before `PLAN PASS` because RDPI guidance forbids pre-plan shared-memory recall unless explicitly waived.
- Generic fallback parsing behavior is not accepted as a target pattern because the intake explicitly asks for typed parse errors and machine-actionable reason codes.

## Source Map

- Parser return types and issue-code generation: `packages/agent/src/reviewContract.ts`
- Gate routing for typed structured parse errors: `packages/agent/src/reviewGate.ts`
- Reviewer aggregation compatibility: `packages/agent/src/subagents/reviewer.ts`
- Repeated same fingerprint handling: `packages/agent/src/reviewGate.ts` plus existing handler stall logic in `packages/agent/src/autoReviewHandler.ts`
- Tests: `packages/agent/src/__tests__/reviewContract.test.ts`, `packages/agent/src/__tests__/reviewGate.test.ts`, and potentially `packages/agent/src/__tests__/reviewer.test.ts`

## Open Questions

- Whether callers outside `reviewContract.ts` require the legacy nullable parser APIs. Proposed answer: add typed parser functions and keep nullable wrappers for compatibility, then migrate gate routing to the typed APIs.
- Whether repeated same fingerprint should immediately return `manual_review_required` or rely on handler-level stall threshold. Proposed answer: route first parse-error finding as `request_changes`; when the same parse-error finding is already in `previousFindings`, route to `manual_review_required` immediately because the intake specifically asks for repeated same fingerprint to avoid retry churn.
