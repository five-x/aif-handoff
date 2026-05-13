# Design - Audit Roadmap Explicit Scope And Risk Contract

## Goal

Make typed audit roadmap generation/import fail closed unless every source audit card has concrete product-relevant scope roots and locally parseable risk hypotheses tied to those roots. Keep synthesis cards scoped to source report artifacts, not product source roots.

## Contract Shape

Add shared generated-card contract support in `packages/shared/src/auditRoadmapContract.ts`.

Source audit cards must satisfy:

- `Scope:` parses to at least one concrete root.
- Each parsed scope root is not repository root, `.`, `./`, `*`, wildcard/glob, `all files`, `entire repository`, or broad prose without path tokens.
- Scope roots are relative project paths or path-like root files/directories.
- `Risk hypotheses:` exists.
- The risk line contains at least one `risk-*` ID.
- Each risk hypothesis entry ties to at least one declared scope root by text inclusion.
- Each declared source scope root is referenced by at least one risk hypothesis.
- `Allowed changes:` remains report-only and cannot name product source, config, or test paths as writable targets.

Synthesis cards must satisfy:

- They remain diagnostic-only and include the existing synthesis outcome requirement.
- Their scope may be report-batch scope, such as `all audit/<date>-*-audit.md reports from this audit batch`.
- They are not required to contain product risk hypotheses.
- Their scope must mention audit report artifacts rather than pretending to inspect product source roots.
- `Allowed changes:` remains limited to the synthesis report artifact and cannot permit product source, config, or test edits.

The local parse target should be intentionally simple and reviewable. A generated source card line can look like:

```text
Risk hypotheses: risk-architecture-boundaries covers README.md, package.json, packages/api: module ownership or routing drift could make future changes unsafe; risk-architecture-coupling covers packages/shared, packages/agent: cross-package contracts could be implicit or brittle.
```

## Shared Validation API

Extend `AuditGeneratedCardIssueCode` with stable issue codes:

- `invalid_source_scope`
- `missing_risk_hypotheses`
- `risk_hypotheses_not_scoped`
- `invalid_synthesis_scope`

Add internal parsing helpers:

- Parse the `Scope:` line/list using the same practical rules as report validation, but keep it local to generated-card validation unless a future task consolidates all scope parsing.
- Extract `Risk hypotheses:` lines and `risk-*` tokens.
- Determine whether a title is synthesis via existing `isAuditSynthesisTitle()`.

Keep the public return shape unchanged:

- `validateGeneratedAuditCard()` continues returning `{ ok, issues, issueDetails }`.
- Existing callers keep receiving legacy issue strings, with new stable `issueDetails` codes available to tests and future gates.

## API Generation Changes

Update `packages/api/src/services/roadmapGeneration.ts`.

Deterministic source card generation:

- Extend `AuditArea` to carry stable risk descriptors.
- Generate `Risk hypotheses:` in `buildAuditRoadmapItem()` for source cards.
- Do not generate `Risk hypotheses:` for synthesis cards unless there is a later explicit contract.
- Ensure `scopeText()` cannot return `"."`. If no candidate/fallback path exists, choose concrete root file/directory candidates from the repository root, excluding `.git`, `node_modules`, build/cache folders, and generated audit/report folders.
- Preserve source-report scope separation by keeping synthesis scope as report-artifact scope and validating synthesis separately.

Prompt and extraction instructions:

- Update audit roadmap generation prompt and audit extraction prompt examples to include `Risk hypotheses:` for source cards.
- State that source cards must not use `Scope: .`, repository root only, wildcard scope, or natural-language-only scope.
- State that synthesis scope is report artifacts from the batch and must not be used as product audit source scope.

Validation paths:

- Existing `validateAuditRoadmapSource()` calls shared card validation, so source markdown import will fail closed when `Scope: .` or missing risk hypotheses appears.
- Existing `validateAuditGeneratedBatch()` also calls shared validation, so generated task batches are protected after deterministic conversion/import.

## Test Design

Shared tests should prove the contract independent of API generation:

- Existing complete source audit description is updated with a `Risk hypotheses:` line.
- `Scope: .` fails with `invalid_source_scope`.
- `Scope: entire repository` fails with `invalid_source_scope`.
- A source card without `Risk hypotheses:` fails with `missing_risk_hypotheses`.
- A source card whose risk IDs do not name the declared scope roots fails with `risk_hypotheses_not_scoped`.
- A synthesis card with report batch scope remains valid.
- Source and synthesis fixtures assert report-only `Allowed changes:` remains valid under the new source/risk contract.
- Existing negative allowed-changes tests remain part of the focused API test run so product source paths cannot become mutable audit outputs.

API tests should prove the platform-level failure mode:

- `validAuditRoadmapContent()` fixture is updated with source risk hypotheses.
- Source roadmap with `Scope: .` rejects before runtime extraction.
- Invalid agent output is replaced with deterministic fallback that includes concrete scopes and `Risk hypotheses:` and excludes `Scope: .`.
- A botIntevra-like project with Python source/config/test/docs roots produces deterministic audit source cards with concrete scope roots and risk IDs.

## Risk Management

- Do not broaden implementation into runtime report repair or audit evidence relevance gates; those are queued separately.
- Avoid breaking synthesis cards by applying source-card risk requirements only when `isAuditSynthesisTitle(title)` is false.
- Keep the existing allowed-changes validator in the shared card path for both source and synthesis cards; the new scope/risk validation must not bypass or weaken it.
- Keep generated risk hypotheses text deterministic and stable enough for tests, but not over-modeled as a schema until audit plan persistence exists.
- Keep error messages actionable so users can fix manually authored ROADMAP.md audit cards.

## Rollback

If the new contract rejects valid audit roadmaps too aggressively, the smallest rollback is to relax the new shared validation helpers and tests. The deterministic fallback and prompt text can remain because they only add explicit scope/risk metadata.
