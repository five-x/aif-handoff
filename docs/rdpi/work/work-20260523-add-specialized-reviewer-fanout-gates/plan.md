# Plan

## Implementation steps

1. Extend shared review typing.
   - Add specialized role constants and role source values in `packages/shared/src/types.ts`.
   - Ensure data hydration in `packages/data/src/index.ts` accepts the expanded source set.

2. Extend structured review parsing and canonical aggregation.
   - Replace hard-coded review source regexes in `packages/agent/src/reviewContract.ts` with the shared source list.
   - Allow `buildStructuredReviewComments` to aggregate additional parsed specialized role outputs while preserving existing `review-sidecar` and `security-sidecar` behavior.

3. Add specialized reviewer fan-out execution.
   - Add role eligibility and role prompt helpers.
   - In `packages/agent/src/subagents/reviewer.ts`, run required specialized roles as typed workflow kinds after or alongside the existing sidecars.
   - Parse role verdicts deterministically and convert inconclusive/unavailable/malformed outputs into role-sourced `manual_review_required` findings.
   - Keep deterministic audit-review shortcuts compatible where they are equivalent aggregate gates; non-deterministic audit review must require `audit_evidence`.

4. Preserve fail-closed coordinator semantics.
   - Let role failures flow through existing `reviewGate`/`autoReviewHandler`.
   - Prevent high-priority/high-risk tasks from bypassing review through `skipReview`.
   - Ensure manual-review role blockers keep using `blocked_external` and `manualReviewRequired=true`.

5. Add tests.
   - Agent contract/reviewer/gate tests for pass, fail, inconclusive, unavailable, audit role eligibility, and role identity.
   - Shared state-machine test for generic retry rejection on specialized manual-review blocks.
   - Data hydration test for new role-sourced persisted `autoReviewState`.
   - Add or use an e2e-style test that exercises reviewer fan-out through review gate outcome.

6. Verification.
   - Run focused agent/shared/data tests.
   - Run `npm.cmd run lint`.
   - Run `npm.cmd run build`.
   - Run mandatory e2e verification against the deployed service at `http://192.168.88.67` with API checks through `http://192.168.88.67/api`; disable local dev-server auto-launch for browser/perf/load checks unless the user explicitly authorizes local validation for the current turn.

## Acceptance mapping

- Typed roles: shared role constants and typed workflow kinds.
- Deterministic aggregation: canonical review comments plus `reviewGate`.
- Stored/projected outputs: role-sourced findings in `autoReviewState` and redacted raw role sections in `reviewComments`.
- Fail-closed manual review: inconclusive/unavailable/malformed role output emits `manual_review_required`.
- Compatibility: existing `review-sidecar` and `security-sidecar` remain accepted and still run.
- Audit default: `taskIntent="audit"` includes `audit_evidence`.
- E2E: mandatory verification result recorded in `result.md`.

## Plan review request

Independent reviewer should check that this plan:

- avoids DB migrations and paid-model requirements;
- keeps existing review/security sidecars compatible;
- makes role identity first-class instead of prompt-only;
- fail-closes unavailable or inconclusive roles;
- includes a concrete e2e verification path before close-out.
