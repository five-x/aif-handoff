# Plan - 09_audit_prompt_cleanup

## Acceptance criteria

- Audit/report prompt is shorter overall.
- Weak findings are still rejected by validators.
- Positive trusted audit findings still pass.
- No new prompt-only guardrail is added.
- `result.md` records before/after prompt lengths for audit first-run, audit rework, and synthesis prompts.

## Steps

1. Measure baseline generated prompt lengths for:
   - audit first-run prompt;
   - audit rework prompt;
   - synthesis prompt.
2. Refactor `packages/agent/src/subagents/implementer.ts`:
   - add the required positive finding contract as a reusable prompt block;
   - insert it into audit/report prompt construction;
   - remove or sharply shorten the long enumerated blacklist in source audit and execution-rule prompt text;
   - keep concise positive requirements for scoped path evidence, observed verification, manifest/ledger evidence, no-findings evidence, and existing paths.
3. Review `packages/shared/src/auditReportValidator.ts` and `packages/shared/src/auditSourceEvidence.ts`:
   - confirm low-quality patterns cover removed prompt examples;
   - add only validator-code coverage if a removed example lacks enforcement.
4. Update tests:
   - in `packages/agent/src/__tests__/implementer.test.ts`, assert the positive contract is present and long blacklist phrases are absent;
   - add or update prompt length checks for first-run, rework, and synthesis paths;
   - in `packages/shared/src/__tests__/auditReportValidator.test.ts`, keep explicit rejection/acceptance tests for weak, governance/doc-only, speculative, fake output, substantive no-findings, and trusted findings.
5. Run focused tests for the touched areas.
6. Run broader lint/build/test checks if focused tests do not cover compilation or if edits affect shared behavior.
7. Write `docs/rdpi/work/09_audit_prompt_cleanup/result.md` with:
   - implementation summary;
   - prompt length before/after table;
   - commands run and outcomes;
   - `PLAN PASS`, `TEST PASS`, and `REVIEW PASS` gate outcomes.

## Gate plan

- Independent plan review must return `PLAN PASS` before implementation.
- Implementation must be delegated to a `coder` after plan pass.
- Verification must be delegated to an independent `tester`.
- Final review must be delegated to an independent `reviewer`.
