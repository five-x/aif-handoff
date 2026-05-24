# Research

## Task framing and lane

- Task: `work-20260523-harden-audit-command-query-output-depth`.
- Lane: `work`.
- Intake source: `docs/intake/work/work-20260523-harden-audit-command-query-output-depth.md`.
- RDPI path: `docs/rdpi/work/work-20260523-harden-audit-command-query-output-depth`.
- The immutable task intent is to harden audit evidence-depth validation so a risk-term search command cannot make unrelated command output or unrelated ledger `outputPreview` satisfy trusted `validated_no_findings` depth.
- The exact confirmed bypass is `rg -n "auth" src/config.ts` with output `src/config.ts:1:export const timeoutMs = 1000;`; the query contains `auth`, but the shown output line does not substantively address auth drift.

## Accepted planning sources

- `AGENTS.md` and `.agents/skills/rdpi/SKILL.md` require local repo facts first, planning-only artifacts before `PLAN PASS`, and independent plan, test, and review gates.
- `python "$env:USERPROFILE\.codex\tools\codex-ensure-rdpi.py"` returned `STATUS: ready`.
- `python "$env:USERPROFILE\.codex\tools\codex-flow-audit.py" --repo .` returned `STATUS: clean`.
- Current repo status has many pre-existing uncommitted changes. This task must avoid reverting unrelated work and keep implementation scoped to audit validator/test surfaces.
- `packages/shared/src/auditSourceEvidence.ts:399` extracts command evidence as `{ command, evidence, inventoryOnly }`; the full evidence string includes the reported command-output block and can be inspected without changing the extraction contract.
- `packages/shared/src/auditReportValidator.ts:2130` identifies only generic dot-style grep as non-substantive. A targeted search command such as `rg -n "auth" src/config.ts` is currently treated as substantive by command shape.
- `packages/shared/src/auditReportValidator.ts:2373` and `packages/shared/src/auditReportValidator.ts:2382` test whether the command string mentions the risk concept.
- `packages/shared/src/auditReportValidator.ts:2400` checks ledger risk substance by concatenating `unit.command.command` and `unit.outputPreview`; this lets a ledger command query term satisfy risk concept matching even when the output preview is unrelated.
- `packages/shared/src/auditReportValidator.ts:2467` trusts substantive ledger units for a risk when the unit is substantive, has the risk ID, and `evidenceUnitMentionsRiskConcept()` passes.
- `packages/shared/src/auditReportValidator.ts:2518` is the main evidence-depth gate. At risk assessment time, risk-specific depth is satisfied when risk-substantive commands, risk ledger units, or empty-file refs exist.
- `packages/shared/src/__tests__/auditReportValidator.test.ts:300` already rejects one inverse mismatch shape: risk-timeout cannot be covered by `rg -n "authMode" src/config.ts` output. The new bypass is different because the risk term appears in the query while the output is unrelated.
- `packages/shared/src/__tests__/auditReportValidator.test.ts:835` is a positive ledger case to preserve: a single substantive ledger unit can cover related timeout/auth risks when the output preview contains both corresponding source lines.
- `docs/rdpi/work/work-20260522-harden-audit-evidence-depth-gates/result.md` records the existing depth reason codes and the rule that no-findings must downgrade to `source_inconclusive` unless risk-specific substantive command, ledger, or empty-file evidence supports depth.
- `docs/rdpi/work/work-20260523-adversarial-audit-evidence-depth-bypass-review/result.md` records the confirmed command-query/output mismatch bypass and identifies it as a follow-up implementation task.
- `docs/rdpi/work/work-20260523-audit-evidence-depth-positive-case-review/result.md` records positive no-findings shapes that must remain accepted, including small config source lines, empty-file hash proof, targeted runtime output, and ledger-backed compact proof.

## Same-project memory

- Shared-memory recall was not queried before `PLAN PASS`, consistent with the RDPI pre-plan boundary.
- Local curated memory documents may be useful after implementation only if the result adds stable validator behavior worth publishing through `$memsync MODE=auto`.

## Cross-project reusable patterns

- No cross-project memory was queried before `PLAN PASS`.
- Reusable pattern candidate: when validating command-derived evidence, do not treat query text, flags, or file paths as proof of result relevance; require the observed output/result body to contain the risk-substantive match or require separate independent risk evidence.

## Rejected or stale memory candidates

- No memory candidates were evaluated for staleness before `PLAN PASS`.

## Open questions

- Whether to introduce a new depth reason code for command query/output mismatch or reuse `irrelevant_grep_match` plus `shallow_evidence`. The intake allows either, and the existing reason-code vocabulary already includes `irrelevant_grep_match`.
- How broad the parser for output-only text should be. The safest initial scope is search-like command evidence and ledger `outputPreview`, with no weakening of manifest, content hash, source snapshot, artifact path, ledger identity, scope membership, or synthesis checks.

## Hypotheses

- H1: The self-reported bypass passes because `riskSubstantiveCommands` is derived from command text; the output line does not need to mention the risk concept.
- H2: The ledger-backed bypass passes because `evidenceUnitMentionsRiskConcept()` accepts the command query as risk substance instead of requiring `outputPreview` to contain a risk-substantive match.
- H3: Requiring search command output/evidence text to mention the risk concept, while still preserving non-search command and empty-file proof behavior, will block both bypasses without making trusted no-findings impossible.
