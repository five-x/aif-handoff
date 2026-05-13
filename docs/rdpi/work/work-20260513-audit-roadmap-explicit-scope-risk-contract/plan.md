# Plan - Audit Roadmap Explicit Scope And Risk Contract

## Plan Review State

Pending independent `PLAN PASS` or `PLAN FAIL`.

## Steps

1. Update shared generated-audit-card validation in `packages/shared/src/auditRoadmapContract.ts`.
   - Add issue codes for invalid source scope, missing risk hypotheses, risk hypotheses not scoped, and invalid synthesis scope.
   - Parse source card `Scope:` values into concrete roots.
   - Reject `Scope: .`, root-only, wildcard/glob, and natural-language-only source scopes.
   - Parse `Risk hypotheses:` and `risk-*` IDs.
   - Require each source scope root to be referenced by at least one risk hypothesis.
   - Exempt synthesis cards from source risk requirements while validating they use report-artifact batch scope.
   - Preserve existing allowed-changes validation for both source and synthesis cards so audit cards remain report-only.

2. Update shared tests in `packages/shared/src/__tests__/auditRoadmapContract.test.ts`.
   - Add `Risk hypotheses:` to the complete valid audit description fixture.
   - Add negative tests for `Scope: .`, broad prose scope, missing risk hypotheses, and risk hypotheses not tied to scope.
   - Add a positive synthesis-card test with report-batch scope.
   - Assert source and synthesis valid fixtures still pass report-only `Allowed changes:` validation.

3. Update deterministic audit roadmap generation in `packages/api/src/services/roadmapGeneration.ts`.
   - Extend audit area data with deterministic risk hypothesis text or descriptors.
   - Emit a `Risk hypotheses:` line for source cards.
   - Keep synthesis scope as audit report artifacts and skip product risk hypothesis generation for synthesis.
   - Replace `scopeText()` root fallback with concrete existing repo path fallback.
   - Update audit generation and extraction prompts to include explicit source scope and risk hypothesis rules.

4. Update API roadmap generation tests in `packages/api/src/__tests__/roadmapGeneration.test.ts`.
   - Update audit fixtures to include `Risk hypotheses:`.
   - Add rejection coverage for imported source roadmaps containing `Scope: .`.
   - Strengthen deterministic fallback coverage to assert no source card has `Scope: .` and source cards include `Risk hypotheses:` with `risk-*`.
   - Add a botIntevra-like project fixture that proves generated audit source cards use concrete product-relevant roots.
   - Assert generated source and synthesis cards keep `Allowed changes:` limited to their report artifacts and do not name product source/config/test paths as mutable outputs.

5. Run focused verification.
   - `npm.cmd test --workspace=@aif/shared -- src/__tests__/auditRoadmapContract.test.ts`
   - `npm.cmd test --workspace=@aif/api -- src/__tests__/roadmapGeneration.test.ts`
   - `npm.cmd run build --workspace=@aif/shared`
   - `npm.cmd run build --workspace=@aif/api`
   - `npm.cmd run lint --workspace=@aif/shared`
   - `npm.cmd run lint --workspace=@aif/api`
   - `git diff --check`

6. Write `docs/rdpi/work/work-20260513-audit-roadmap-explicit-scope-risk-contract/result.md`.
   - Record implementation summary, verification, and gate outcomes.
   - Record any skipped or failed checks explicitly.

7. Run memory sync after `TEST PASS` and `REVIEW PASS`.
   - `python "$env:USERPROFILE\.codex\tools\codex-memsync.py" --repo . --mode auto --lane work --task-id work-20260513-audit-roadmap-explicit-scope-risk-contract --project aif-handoff --entity aif-handoff`
   - Treat local review failure as blocking.
   - Treat shared-memory publish failure as a warning if local review artifacts succeed.

8. Update intake status only after successful RDPI close-out and local memory review.
   - Update only the matching entry in `docs/intake/work_status.json`.
   - Set status to `done`, keep `rdpiPath`, and set `updated` to `2026-05-13`.

## Acceptance Mapping

- Broad root scopes are rejected by shared validation and API import tests.
- Deterministic generation repairs invalid model output into concrete source roots and never emits source `Scope: .`.
- Source cards include parseable `risk-*` hypotheses tied to their scope roots.
- Synthesis cards keep source-report scope separate from product audit source scope.
- Source and synthesis cards remain diagnostic-only with report-only allowed changes.
- BotIntevra-like regression coverage proves generated source cards are not root scoped.

## Gate Requirements

- Independent `PLAN PASS` is required before implementation.
- Independent `TEST PASS` is required after implementation.
- Independent `REVIEW PASS` is required after testing.
- If any gate fails, revise the invalidated artifacts or code and rerun the gate.
