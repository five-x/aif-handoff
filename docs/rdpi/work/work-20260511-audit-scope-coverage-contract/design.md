# Design - Audit Scope Coverage Contract

## Goals

- Make declared audit scope a machine-checkable part of audit report validation.
- Keep enforcement generic for any project root, not tuned to `aif-handoff` or a canary repository.
- Preserve the existing shared validator as the source of truth for report-content quality.
- Produce actionable blocked reasons that tell the report author which scoped root is under-covered.

## Non-goals

- Do not require exhaustive inspection of every file in a directory.
- Do not change roadmap generation prompts in this task unless required by validator API integration.
- Do not change review-gate wiring; that is covered by `work-20260511-audit-review-gate-validator-unification`.
- Do not change rework freshness behavior; that is covered by `work-20260511-audit-rework-freshness-contract`.

## Validator contract

Extend `AuditReportValidationInput` with task context:

- `taskDescription?: string | null`
- optionally `scopeRoots?: string[]` if callers already parsed them in the future

Extend `AuditReportValidationResult` with:

- `scopeRoots: AuditScopeRoot[]`
- `scopeCoverage: AuditScopeCoverageResult[]`

Add issue codes:

- `missing_declared_scope_root` for declared path-like scope roots that do not resolve under the project root.
- `missing_scope_coverage` for scoped roots that resolve but lack required report evidence.

## Scope parsing

`parseAuditScopeRoots()` should:

- Find lines beginning with `Scope:`.
- Also handle markdown list continuation lines immediately under a `Scope:` heading if they contain path-like tokens.
- Split comma-separated roots.
- Strip backticks, quotes, trailing punctuation, and leading `./`.
- Ignore non-path prose such as `all audit reports from this batch` unless it contains explicit path-like tokens.
- Normalize path separators to `/`.
- Deduplicate case-insensitively on Windows.

## Coverage rules

For each scope root:

- Missing root: issue `missing_declared_scope_root`.
- File root: require a valid existing line reference to that exact file in the report.
- Directory root:
  - require valid existing line references to representative files under that directory;
  - require command/tool evidence that mentions the directory/root;
  - representative minimum is `min(3, fileCountUnderDirectory)` with at least one file when the directory has files.

The file count helper should cap traversal work and ignore common generated/heavy directories such as `node_modules`, `.git`, `dist`, `build`, and coverage output. If enumeration is capped, the required representative count remains small and actionable.

## Completion gate integration

`evaluateTaskCompletionEvidence()` should pass the task description into `validateAuditReportArtifact()`. Scope issues returned by the validator must make `auditReportValidation.ok` false and `substantiveReportEvidence` false, even if the legacy evidence fallback sees generic substantive evidence.

No new completion issue code is required for this task. Existing `insufficient_report_evidence` and `low_quality_report_evidence` can surface the validator message, but the validator issue code should be available in `evidence.auditReportValidation.issues` for future review-gate unification.

## Test design

Focus tests in `packages/shared/src/__tests__/auditReportValidator.test.ts` because the behavior belongs to the shared validator. Add at least one completion-gate regression in `taskCompletionEvidence.test.ts` if needed to prove the task description is passed through and not bypassed by legacy evidence.
