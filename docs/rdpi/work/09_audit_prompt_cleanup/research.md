# Research - 09_audit_prompt_cleanup

## Task framing and lane

- Task ID: `09_audit_prompt_cleanup`
- Lane: `work`
- Source task file: `C:/Users/apron/Desktop/aif_stabilization_tz_pack/09_audit_prompt_cleanup.md`
- Goal: shorten audit/report prompts by replacing long prompt blacklist guidance with a short positive finding contract, while keeping or expanding detailed rejection rules in validators.
- Acceptance includes prompt size before/after for audit first-run, audit rework, and synthesis prompts in `result.md`.

## Accepted planning sources or local facts

- `AGENTS.md` confirms this repository is a Node/TypeScript project and the canonical commands are `npm.cmd run build`, `npm.cmd test`, and `npm.cmd run lint`.
- RDPI preflight command returned `STATUS: ready`.
- Current worktree already has unrelated modified docs/memory and prior RDPI files; this task must not revert or rewrite them.
- `packages/agent/src/subagents/implementer.ts` builds audit report and synthesis prompts inside `runImplementer`.
- Report vs synthesis detection happens from `roadmapArtifact.role` and the prompt assembly shares one large `rawPrompt`.
- Main prompt assembly includes report, rework, and synthesis conditional blocks around the audit writer contract, manifest contract, repair guidance, source audit scope discipline, synthesis mode, and execution rules.
- The longest prompt blacklist block is in the audit execution rules, where many non-promotable finding families are enumerated inline.
- A smaller overlapping blacklist exists in the source audit scope discipline block.
- Audit evidence repair mode also contains detailed negative guidance for fake output, rejected findings, large files, and git hashes.
- `packages/shared/src/auditReportValidator.ts` already has validator issue codes for weak/fake/governance/evidence failures and a `LOW_QUALITY_REPORT_PATTERNS` set containing the detailed low-quality finding patterns.
- `packages/shared/src/auditSourceEvidence.ts` already checks trusted finding sections for path-line evidence, concrete risk, proposed fix, and observed verification markers.
- Existing validator tests cover weak refactor smells, governance/doc-only observations, speculative claims, fake/placeholder output, positive no-findings evidence, and trusted findings.
- Existing implementer tests assert current prompt contents, including some phrases that should be removed or replaced with absence checks.

## Same-project memory

- Not consulted before `PLAN PASS` because the RDPI boundary for this implementation task is satisfied by local task files, repository docs, and local code facts.

## Cross-project reusable patterns

- Not consulted. No cross-project pattern is needed to plan this scoped code/test change.

## Rejected or stale memory candidates

- None considered.

## Open questions and assumptions

- Assumption: `09_audit_prompt_cleanup` is a `work` lane task, matching the surrounding stabilization RDPI history and implementation scope.
- Assumption: prompt size before/after can be captured during implementation by checking the generated prompt lengths in focused implementer test fixtures, without needing to run live services.
- Assumption: the task does not require changing roadmap-generation prompts outside the named target files unless tests reveal the same runtime prompt blacklist is produced there.

## Proposed evidence plan

- Add focused tests to assert the audit runtime prompt contains the short positive finding contract and no longer contains the long blacklist phrases.
- Preserve or add validator tests proving weak findings still fail through issue codes rather than prompt-only guardrails.
- Capture prompt length before and after for first-run audit, audit rework, and synthesis prompt paths and record the values in `result.md`.
