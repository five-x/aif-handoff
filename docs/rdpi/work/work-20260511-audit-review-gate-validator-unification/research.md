# Research - Review Gate Uses Audit Validator

Task: `work-20260511-audit-review-gate-validator-unification`
Lane: `work`
RDPI Needed: yes

## Task Intent

Unify auto review gate acceptance for audit/review/discovery report artifacts with the deterministic audit report validator. Review sidecars may add findings, but their advisories or lack of blockers must not accept a report artifact that validator logic rejects.

## Accepted Local Facts

- RDPI preflight returned `STATUS: ready`.
- `codex-flow-audit.py --repo .` returned `STATUS: clean`.
- Parent RDPI `work-20260511-audit-quality-system-analysis` split this task after establishing that prompt-only sidecar review accepted weak audit reports.
- Prior sibling tasks are already present in the local worktree:
  - `packages/shared/src/auditReportValidator.ts` exposes `validateAuditReportArtifact()` and typed issue codes.
  - `packages/shared/src/taskCompletionEvidence.ts` already calls the shared validator and stores `auditReportValidation` in completion evidence.
  - `packages/agent/src/coordinator.ts` and `packages/api/src/services/taskEvents.ts` update roadmap batch artifact state from `evaluateTaskCompletionEvidence()` on terminal/approve-time checks.
- Current `reviewGate.ts` imports `evaluateTaskCompletionEvidence`, `hasSubstantiveReportEvidence`, and `isRiskyTask`, but it only uses the completion result to prove that a risky task has a committed substantive report before accepting no-blocker review comments.
- `requiresSubstantiveReviewEvidence()` in `reviewGate.ts` currently ignores `result.ok` and can return acceptance when `taskEvidence.evidence.substantiveReportEvidence` is true, even if the shared validator has deterministic issues such as synthetic git output, contradictory no-findings semantics, missing scope coverage, or governance-only findings.
- Structured review comments are parsed by `reviewContract.ts`; canonical blocking/advisory lines support `review_gate` as a source, so validator-derived findings can reuse the existing `AutoReviewFinding` shape.
- The review gate has three parser paths:
  - structured canonical comments,
  - legacy `## Blocking Findings` section,
  - model-based legacy fallback.
    The validator must run independently of all three so malformed-output manual review behavior remains intact.

## Same-Project Memory

- Not queried before `PLAN PASS`; current RDPI guidance forbids shared-memory recall before plan approval unless explicitly waived.

## Open Questions

- None blocking. The implementation can use `evaluateTaskCompletionEvidence()` as the shared validator consumer because completion guard, approve-time checks, and roadmap artifact state already use that path.

## Risk Notes

- Running the full completion evidence guard inside review gate may include guard issues beyond the validator itself, such as missing review-stage tool activity. That is acceptable only if converted into review-gate blocking findings for risky report artifacts and kept additive to sidecar findings.
- The review gate should avoid returning `manual_review_required` when the deterministic guard can decide the artifact is invalid; deterministic issues should request changes.
- Existing advisory-only success should remain valid when the deterministic guard passes or when no risky report task is in scope.
