# Design - 09_audit_prompt_cleanup

## Scope

In scope:

- `packages/agent/src/subagents/implementer.ts`
- `packages/shared/src/auditReportValidator.ts`
- `packages/shared/src/auditSourceEvidence.ts`
- `packages/shared/src/__tests__/auditReportValidator.test.ts`
- `packages/agent/src/__tests__/implementer.test.ts`
- `docs/rdpi/work/09_audit_prompt_cleanup/result.md`

Out of scope:

- Running or changing derived follow-up audit tasks.
- Reverting unrelated `docs/memory/**`, `docs/kb/**`, or prior RDPI changes already present in the worktree.
- Adding new prompt-only blacklist guardrails.

## Proposed approach

Add one small prompt helper in `implementer.ts` for the required positive finding contract:

```text
A trusted audit finding requires:
1. exact existing project-root-relative path:line evidence;
2. concrete broken behavior, unsafe state, data-loss path, security/control failure, or regression;
3. proposed fix;
4. observed verification output;
5. evidence within declared scope.

If any condition is missing, do not promote it as a finding.
```

Use that helper in the audit writer/report prompt path and remove the large enumerated blacklist from the model-facing execution rules. Keep brief operational instructions for scoped evidence, manifest/ledger usage, no-findings evidence, placeholders, and existing path validation where those are positive runtime requirements rather than lists of rejected finding types.

Keep detailed low-quality finding families in validator code. If a weak family currently appears only in prompt text and is not covered by `LOW_QUALITY_REPORT_PATTERNS` or source-evidence checks, add or tighten validator patterns/tests there instead of reintroducing prompt wording.

Update prompt tests to assert:

- The short positive finding contract appears.
- Long blacklist phrases like line-count/single-file hub, import coupling, ownership-gap docs, and orphan/no-wiring guesses are absent from generated audit prompts.
- Prompt lengths for first-run, rework, and synthesis paths do not grow.

Update validator tests only as needed to keep the requested negative/positive cases explicit and code-enforced.

## Verification design

Focused checks:

- Run targeted implementer tests covering first-run audit prompt, audit rework prompt, and synthesis prompt.
- Run targeted audit report validator tests for weak finding rejection, governance/doc-only rejection, speculative rejection, fake command output rejection, positive no-findings, and positive trusted findings.

Broader checks if focused tests pass:

- Run package-level tests for `@aif/agent` and `@aif/shared` or the repository test command if runtime cost is acceptable.
- Run lint/build if touched TypeScript compiles cleanly but test commands do not already typecheck the affected code.

## Risk management

- Risk: removing prompt blacklist text could reduce runtime model behavior before validators catch issues.
  Mitigation: keep the positive trusted finding contract in the prompt and rely on validator issue codes as the fail-closed enforcement point.
- Risk: prompt snapshot tests may currently assert old blacklist phrases.
  Mitigation: update them to assert the new contract and absence of blacklist phrases.
- Risk: synthesis prompts may be deterministic in some tests and not expose a runtime prompt.
  Mitigation: use existing synthesis prompt tests that inject validated artifacts when available; otherwise record the deterministic path constraint in `result.md`.
