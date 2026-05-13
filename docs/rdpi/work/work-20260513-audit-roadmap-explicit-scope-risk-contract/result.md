# Result - Audit Roadmap Explicit Scope And Risk Contract

## Outcome

Implemented deterministic audit roadmap generation/import guardrails so source audit cards fail closed when they use broad root scopes or omit locally parseable, scoped risk hypotheses.

## Changes

- Added shared generated-audit-card validation for source audit scope and risk hypotheses in `packages/shared/src/auditRoadmapContract.ts`.
- Source audit cards now reject broad or non-concrete scope values such as `.`, `./`, `*`, globs, `all files`, `entire repository`, and natural-language-only scope.
- Source audit cards now require a `Risk hypotheses:` line with `risk-*` IDs, and each declared scope root must appear in at least one risk hypothesis.
- Synthesis cards remain exempt from product source risk hypotheses, but now require report-batch scope and continue to use report-only allowed changes.
- Deterministic audit roadmap fallback generation now emits `Risk hypotheses:` for source cards and no longer falls back to source `Scope: .`.
- Audit generation and extraction prompts now describe the concrete source scope and risk hypothesis contract.
- Regression tests cover shared validation, root-scope rejection, risk hypothesis requirements, synthesis report-batch scope, report-only allowed changes, deterministic fallback, and a botIntevra-like project fixture.

## Verification

- `npm.cmd test --workspace=@aif/shared -- src/__tests__/auditRoadmapContract.test.ts` passed locally and in the independent TEST gate.
- `npm.cmd test --workspace=@aif/api -- src/__tests__/roadmapGeneration.test.ts` passed locally and in the independent TEST gate.
- `npm.cmd run build --workspace=@aif/shared` passed locally and in the independent TEST gate.
- `npm.cmd run build --workspace=@aif/api` passed locally and in the independent TEST gate.
- `npm.cmd run lint --workspace=@aif/shared` passed locally and in the independent TEST gate.
- `npm.cmd run lint --workspace=@aif/api` passed locally and in the independent TEST gate.
- `git diff --check` passed locally and in the independent TEST gate.

## Gates

- `PLAN FAIL`: first independent plan review found missing explicit diagnostic-only allowed-changes verification for source and synthesis cards.
- Fix applied: revised `design.md` and `plan.md` to preserve and test report-only allowed changes for both source and synthesis audit cards.
- `PLAN PASS`: independent plan review rerun accepted the revised plan.
- `TEST PASS`: independent tester ran all requested focused tests, builds, lints, and diff sanity checks successfully.
- `REVIEW PASS`: independent final reviewer found no blocking issues and accepted the implementation.

## Memory Sync

- `python "$env:USERPROFILE\.codex\tools\codex-memsync.py" --repo . --mode auto --lane work --task-id work-20260513-audit-roadmap-explicit-scope-risk-contract --project aif-handoff --entity aif-handoff` completed local review artifact generation.
- Report: `docs/memory/reports/work-20260513-audit-roadmap-explicit-scope-risk-contract-memsync-report.md`.
- Sync status: `skipped` because there were no publishable curated documents.
- Generated local artifacts:
  - `docs/memory/tasks/work/work-20260513-audit-roadmap-explicit-scope-risk-contract-delta.md`
  - `docs/memory/tasks/work/work-20260513-audit-roadmap-explicit-scope-risk-contract-hypotheses.md`
  - `docs/memory/projects/aif-handoff/capsule.md`
  - `docs/memory/entities/aif-handoff/capsule.md`
