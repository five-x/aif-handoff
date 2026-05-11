# Research - Audit Scope Coverage Contract

## Task framing and lane

- Task ID: `work-20260511-audit-scope-coverage-contract`
- Lane: `work`
- RDPI needed: yes
- Request: make declared audit scope machine-checkable so audit reports prove they inspected scoped product areas, not only convenient documentation files.
- Diagnostic boundary: this is an implementation task for the `aif-handoff` platform. It is not an audit of another repository and must not encode canary-project paths.

## Accepted planning sources or local facts

- RDPI preflight returned `STATUS: ready`.
- `codex-flow-audit.py --repo .` returned `STATUS: clean`; no mixed-intake routing hazard was detected.
- Intake card: `docs/intake/work/work-20260511-audit-scope-coverage-contract.md`.
- Parent decomposition: `docs/rdpi/work/work-20260511-audit-quality-system-analysis/*`.
- Existing shared validator surface:
  - `packages/shared/src/auditReportValidator.ts` defines `AuditReportValidationInput`, `AuditReportValidationResult`, and typed validation issues.
  - `validateAuditReportArtifact()` currently validates path references, low-quality report patterns, invalid line references, contradiction between findings and no-findings, and substantive evidence shape.
  - It proves that a report has some substantive repository evidence; it does not prove that evidence covers the task's declared `Scope:`.
- Completion gate surface:
  - `packages/shared/src/taskCompletionEvidence.ts` calls `validateAuditReportArtifact()` and exposes its result through `evidence.auditReportValidation`.
  - The completion gate still computes legacy substantive evidence as a compatibility fallback, so scope failures must be surfaced as validator issues and must not be bypassed by the legacy path.
- Scope producer surface:
  - `packages/api/src/services/roadmapGeneration.ts` generates task descriptions with `Scope:` lines.
  - Existing roadmap fixtures already use examples such as `Scope: src/config.ts, src/index.ts` and `Scope: src`.
- Existing tests:
  - `packages/shared/src/__tests__/auditReportValidator.test.ts` covers bad reports, valid no-findings reports, valid findings, and mixed findings/no-findings rejection.
  - `packages/shared/src/__tests__/taskCompletionEvidence.test.ts` has broad completion guard coverage and expected report artifact path fixtures.

## Same-project memory

- Shared memory was not queried before `PLAN PASS` because the RDPI contract forbids shared-memory recall before the planning gate unless explicitly waived.
- Local RDPI artifacts and source files are sufficient for this task.

## Cross-project reusable patterns

- None accepted. This is a local platform validator contract.

## Rejected or stale memory candidates

- No memory candidates were queried.

## Implementation hypotheses

- Add scope parsing to the shared audit report validator input rather than adding an API-only checker. Completion evidence already centralizes report validation through that validator.
- Parse explicit `Scope:` lines from task descriptions into normalized scope roots. Keep parsing conservative: accept comma-separated path-like roots and backticked roots; ignore broad prose scopes that cannot be checked deterministically.
- Classify roots using the project filesystem:
  - Existing file roots require at least one concrete valid `path:line` citation for that file.
  - Existing directory roots require representative concrete file citations under the directory and command evidence that mentions the directory/root.
  - Missing roots should block with an actionable validator issue rather than silently passing.
- Directory coverage should be representative. A deterministic minimum of one cited file for small directories and up to three for larger directories is enough to prove the report inspected the root without requiring exhaustive line-by-line review.
- Reports citing only documentation or repo metadata files must fail when declared scope includes source directories such as `src` or package modules.

## Acceptance checks

- Unit: parse `Scope: src/config.ts, packages/shared/src` into explicit normalized scope roots.
- Unit: a scoped file without a concrete existing line citation fails.
- Unit: a scoped directory without representative file evidence under the directory fails.
- Unit: a scoped directory with file citations but no command evidence mentioning that root fails.
- Negative: scope `src, packages/shared/src`; report cites only `README.md:1`, `AGENTS.md:1`, and `pyproject.toml:1` plus commands; validation fails with an actionable scope coverage issue.
- Positive: valid findings report covers a scoped file and scoped directory.
- Positive: valid no-findings report covers scoped roots through checked files and checked commands.
- Regression: a large directory can pass with representative coverage rather than exhaustive coverage.
