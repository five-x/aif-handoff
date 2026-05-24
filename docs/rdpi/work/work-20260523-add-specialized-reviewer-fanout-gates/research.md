# Research

## Task framing and lane

- Task ID: `work-20260523-add-specialized-reviewer-fanout-gates`
- Lane: `work`
- Intake card: `docs/intake/work/work-20260523-add-specialized-reviewer-fanout-gates.md`
- RDPI needed: `yes`
- User-added condition: e2e verification is mandatory for close-out.

The task asks for a typed, auditable specialized reviewer fan-out gate for high-risk local-first work. Required reviewer roles are `correctness`, `security_data_loss`, `regression_api_contract`, and `audit_evidence` for audit/review/discovery work. Any role `FAIL` must block completion and feed structured findings into `autoReviewState`; any role `INCONCLUSIVE`, unavailable role, or missing required evidence must fail closed to `blocked_external` with `manualReviewRequired=true` unless a deterministic rework path exists.

## Accepted planning sources or local facts

- `AGENTS.md` requires RDPI for non-trivial work, independent plan/test/review gates, and no implementation before `PLAN PASS`.
- `docs/intake/work/work-20260523-add-specialized-reviewer-fanout-gates.md` defines the immutable task intent and acceptance criteria.
- `python "$env:USERPROFILE\.codex\tools\codex-ensure-rdpi.py"` returned `STATUS: ready`.
- `python "$env:USERPROFILE\.codex\tools\codex-flow-audit.py" --repo .` returned `STATUS: clean`.
- `packages/agent/src/subagents/reviewer.ts` currently fans out only to `review-sidecar` and `security-sidecar`, then stores one canonical `reviewComments` blob.
- `packages/agent/src/reviewContract.ts` parses and serializes canonical structured review comments; source identity is currently limited to `code_review`, `security_audit`, and `review_gate`.
- `packages/shared/src/types.ts` defines `AutoReviewFinding.source` and `AutoReviewState`, so this is the existing review-state identity surface to extend.
- `packages/agent/src/reviewGate.ts` deterministically maps structured review comments to `success`, `request_changes`, `manual_review_required`, or `operator_input_required`.
- `packages/agent/src/autoReviewHandler.ts` wraps review-gate outcomes into coordinator outcomes and comments.
- `packages/agent/src/coordinator.ts` applies fail-closed states by moving tasks to `blocked_external`, setting `manualReviewRequired`, and preserving `autoReviewState`.
- `packages/shared/src/stateMachine.ts` rejects `retry_from_blocked` when `manualReviewRequired` or manual-review wording is present.
- `packages/data/src/index.ts` hydrates and validates persisted `autoReviewStateJson`, including finding source allow-lists.
- `packages/shared/src/taskCompletionEvidence.ts` counts review-stage repository tool activity for risky audit/review/discovery completion checks.
- `packages/web/e2e` contains Playwright-based e2e/perf tests. Project validation policy now requires these service/e2e checks to target the deployed service at `http://192.168.88.67` with API checks through `http://192.168.88.67/api` and local dev-server auto-launch disabled unless the user explicitly authorizes local validation.

## Same-project memory

Not used before `PLAN PASS`. The local RDPI contract forbids shared-memory recall before plan approval unless explicitly waived, and the task is sufficiently grounded by local repo facts.

## Cross-project reusable patterns

Not used before `PLAN PASS` for the same reason. No cross-project pattern is needed to choose the local implementation shape.

## Rejected or stale memory candidates

- Existing `docs/memory/**` files mention auto-review and manual-review behavior, but local source code and task card are higher priority for this repo-specific implementation.
- No runtime or live service evidence was collected during planning.
