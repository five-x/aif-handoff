# Research

## Task framing and lane

- Task: `work-20260523-adversarial-audit-evidence-depth-bypass-review`
- Lane: work
- Intake card: `docs/intake/work/work-20260523-adversarial-audit-evidence-depth-bypass-review.md`
- RDPI path: `docs/rdpi/work/work-20260523-adversarial-audit-evidence-depth-bypass-review`
- Scope: run a diagnostic-only adversarial audit of the evidence-depth gate added by `work-20260522-harden-audit-evidence-depth-gates`.
- Objective: determine whether shallow no-findings evidence can still be promoted to trusted `validated_no_findings`.
- Out of scope: production code changes, weakening existing manifest/source snapshot/content hash/artifact path/ledger identity/scope membership/synthesis membership checks, and executing any follow-up implementation task in this run.

## Accepted planning sources or local facts

- `AGENTS.md` identifies this as a Node/TypeScript repository and lists `npm.cmd run build`, `npm.cmd test`, and `npm.cmd run lint` as the canonical commands.
- `AGENTS.md` and `.agents/skills/rdpi/SKILL.md` require RDPI for non-trivial work and require `PLAN PASS`, `TEST PASS`, and `REVIEW PASS` before close-out.
- `.agents/skills/runtask/SKILL.md` says audit/review/discovery tasks are diagnostic only. They may create queued follow-up implementation cards, but must not auto-run them.
- The selected intake card requires enumeration of bypass attempts around mixed claims, no-risk scoped claims, path-only risk term matches, generic or quoted dot-grep variants, reused snippets, identity-bound but non-substantive ledger evidence, command-output-shaped prose, and risk wording that leaks across adjacent line segments.
- The done criteria require separate queued implementation tasks for confirmed bypasses and separate corpus/test tasks, or attachment to the existing corpus task, for test-only gaps.
- The prior hardening close-out claims `evidenceDepth` assessments for the report, scoped roots, and risk hypotheses; depth reason codes including `shallow_evidence`, `inventory_only_evidence`, `irrelevant_grep_match`, `insufficient_scope_depth`, and `reused_generic_evidence`; no-findings downgrades to `source_inconclusive` unless supported by risk-specific substantive command, ledger, or empty-file evidence; and trusted no-findings projection requiring persisted `evidenceDepth.trustedNoFindingsSupported === true`.
- Planning source-map search located likely post-plan review targets in `packages/shared/src/auditReportValidator.ts`, `packages/shared/src/auditSourceEvidence.ts`, `packages/shared/src/auditSynthesisClassifier.ts`, `packages/shared/src/taskCompletionEvidence.ts`, `packages/shared/src/auditRoadmapContract.ts`, `packages/data/src/index.ts`, `packages/agent/src/subagents/implementer.ts`, and their tests. This is a planning source map only, not a behavioral verdict.
- An independent explorer performed planning-only research and reported no tests, runtime checks, shared-memory recall, edits, or validated bypass findings.

## Same-project memory

- Shared-memory recall was not run before `PLAN PASS`; the RDPI boundary forbids shared-memory recall before the plan gate unless explicitly waived.
- Local `docs/memory/**` artifacts were not treated as authoritative task evidence for this pre-plan phase. Current task files, AGENTS guidance, RDPI templates, and local source/docs remain the planning sources.

## Cross-project reusable patterns

- None used before `PLAN PASS`.

## Rejected or stale memory candidates

- None evaluated. No memory candidates were accepted or rejected before the plan gate.

## Open questions

- A bypass "passes" should mean it can produce or preserve trusted `validated_no_findings` in at least one relevant consumer path. The plan should test validator-level classification first, then synthesis/trust propagation where the bypass class plausibly crosses that boundary.
- Constructed adversarial examples should be in-memory or documented in `result.md`; the RDPI skill restricts task artifacts to `research.md`, `design.md`, `plan.md`, and `result.md`.
- Confirmed bypass follow-up cards must include exact report/manifest/ledger inputs, command or function entry point, observed classification, and expected classification.
- Test-only gaps should not be implemented here. They should be queued or attached to `work-20260523-expand-audit-evidence-depth-regression-corpus`.

## Hypotheses

- H1: The validator rejects shallow no-findings attempts at the source-report classification boundary.
- H2: Mixed explicit risk and no-risk scoped absence claims cannot let one substantive claim launder adjacent shallow claims.
- H3: Path names, quoted dot-grep output, command-shaped prose, and identity-bound ledger units cannot satisfy risk-substantive depth without behavior-relevant evidence.
- H4: Synthesis and data trust paths do not re-promote a source report that the validator classifies as shallow or depth-unsupported.
