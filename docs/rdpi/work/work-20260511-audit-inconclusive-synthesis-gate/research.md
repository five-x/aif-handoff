# Research - Audit Inconclusive Synthesis Gate

Task: `work-20260511-audit-inconclusive-synthesis-gate`
Lane: `work`
Date: 2026-05-11

## Task framing and lane

- Intake card: `docs/intake/work/work-20260511-audit-inconclusive-synthesis-gate.md`.
- RDPI needed: yes.
- Scope: platform-level audit batch synthesis and completion gating, not a project-specific or `audit-v7` special case.
- Request: distinguish a structurally valid empty audit synthesis from a product-quality audit conclusion. A batch with zero included findings and only deterministic fallback, weak coverage, or inventory/existence evidence must not close as successful.
- Acceptance requires one shared classification across deterministic synthesis output, completion evidence, review gate, and roadmap batch artifact state.

## Accepted planning sources or local facts

- `AGENTS.md` requires Node commands through npm and keeps `docs/rdpi/` as task history source of truth.
- `docs/rdpi/work/work-20260511-audit-report-contract-validator/result.md` records the shared deterministic audit report validator, exposed from `packages/shared/src/auditReportValidator.ts` and consumed by completion evidence.
- `docs/rdpi/work/work-20260511-audit-review-gate-validator-unification/result.md` records that review gate acceptance already consumes deterministic completion/audit validation for risky report artifacts.
- `docs/rdpi/work/work-20260511-audit-batch-integration-canary/result.md` records canary coverage for weak reports, invalid artifacts, synthesis readiness, and local token-cost semantics.
- `packages/shared/src/auditReportValidator.ts` returns report-level structural validity and `substantiveEvidence`, but not a batch conclusion class.
- `packages/shared/src/auditReportValidator.ts` accepts `No validated findings` when checked files/commands exist with line references and command-output-shaped text.
- `packages/shared/src/taskCompletionEvidence.ts` runs the shared validator and exposes `evidence.auditReportValidation`, then maps failures into completion issue codes.
- `packages/shared/src/auditRoadmapContract.ts` maps completion issue codes into audit failure families. It currently has no inconclusive audit family.
- `packages/data/src/index.ts` treats roadmap batch synthesis as ready once all non-synthesis artifacts are terminal, including invalid/missing/external-blocked terminal reports.
- `packages/agent/src/subagents/implementer.ts` reads terminal roadmap report artifacts for synthesis and includes weak/invalid reports as coverage gaps.
- `packages/agent/src/subagents/implementer.ts` deterministic synthesis emits `No validated findings` when zero source findings pass inclusion, then generates checked-command evidence using `git ls-files`.
- `packages/agent/src/reviewGate.ts` converts completion/audit validation failures into `review_gate` blocking findings before success.
- Existing relevant tests:
  - `packages/shared/src/__tests__/auditReportValidator.test.ts`.
  - `packages/shared/src/__tests__/taskCompletionEvidence.test.ts`.
  - `packages/shared/src/__tests__/auditRoadmapContract.test.ts`.
  - `packages/agent/src/__tests__/implementer.test.ts`.
  - `packages/agent/src/__tests__/reviewGate.test.ts`.
  - `packages/agent/src/__tests__/coordinator.test.ts`.
  - `packages/data/src/__tests__/index.test.ts`.

## Same-project memory

- Not queried before `PLAN PASS`. The RDPI boundary forbids shared-memory recall before plan approval unless explicitly waived. Local task files, repo docs, and source files were sufficient for planning.

## Cross-project reusable patterns

- Not queried before `PLAN PASS` for the same reason. No cross-project pattern is needed to define this repository-local classifier and gate.

## Rejected or stale memory candidates

- None evaluated.

## Hypotheses

- H1: The failure is not a markdown-schema problem. It is a missing conclusion classifier between report-level structural validity and batch-level product-quality meaning.
- H2: Deterministic no-findings synthesis currently manufactures inventory verification with `git ls-files`, which can make weak source audits look owner-grade at the synthesis layer.
- H3: Completion evidence and review gate can fail closed once synthesis output carries a shared `audit_inconclusive` classification or can be classified as inconclusive from content.
- H4: Roadmap batch artifact state can keep the existing terminal `invalid` state while recording the shared `inconclusive_batch_evidence` failure family and classification details.
- H5: The source-report classification must be persisted and re-used by completion evidence; final synthesis markdown alone is not authoritative because it can claim a stronger conclusion than the source reports support.

## Proposed evidence plan

- Add fixture tests for the shared synthesis classifier:
  - validated finding present.
  - validated no-findings with substantive command output and scoped file/line evidence.
  - inconclusive no-findings with only inventory/existence checks such as `git ls-files`.
- Add completion evidence tests for audit synthesis tasks:
  - six zero-finding inventory-only source summaries block with `audit_inconclusive`.
  - final artifact text that claims valid no-findings still blocks when the persisted source-report outcome is inconclusive.
  - substantive no-findings synthesis passes.
- Add deterministic implementer synthesis tests:
  - inventory-only source reports produce `Audit inconclusive`.
  - substantive no-findings source reports carry source command evidence and validate.
- Add roadmap/failure-family tests so `audit_inconclusive` maps to `inconclusive_batch_evidence`.
- Run focused package tests and builds for shared/agent/data.
