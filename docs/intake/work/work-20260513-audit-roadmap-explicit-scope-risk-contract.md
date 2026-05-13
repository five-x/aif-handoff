# Audit Roadmap Explicit Scope And Risk Contract

- Task ID: work-20260513-audit-roadmap-explicit-scope-risk-contract
- Lane: work
- Status: done
- Priority: critical
- Created: 2026-05-13
- Due: unset
- Source: audit-v10 quality review
- RDPI Needed: yes
- RDPI Path: docs/rdpi/work/work-20260513-audit-roadmap-explicit-scope-risk-contract

## Request

Harden audit roadmap generation so source audit cards cannot be created with broad `Scope: .` and empty or implicit risk hypotheses. The audit-v10 botIntevra run produced six source cards with `Scope: .`; this allowed deterministic repair and validation to treat arbitrary repository files as sufficient evidence for `validated_no_findings`.

## Done When

- Audit roadmap generation rejects or repairs broad root scopes such as `.`, repository root only, or unconstrained natural-language scope.
- Generated audit source cards include concrete product-relevant scope roots such as source, test, config, docs/ops, or explicitly named files/directories.
- Generated source cards include machine-readable or at least locally parseable risk hypotheses tied to scope roots.
- Synthesis cards keep source-report scope separate from product audit scope.
- Existing guardrails and tests cover a botIntevra-like audit request and prove source cards are not generated with `Scope: .`.

## Constraints

- Follow RDPI before implementation.
- Do not execute this task during intake.
- Preserve diagnostic-only audit behavior: source audit cards may create/update only their report artifact.
- Do not rely on prompts alone; add deterministic validation or fallback shaping.

## Notes

- audit-v10 source descriptions all contained `Scope: .`.
- The failure mode was not a missing-file hallucination; paths existed but were not relevant to the audit mandate.
- This task should precede any new botIntevra audit run.

## Links

- Related intake: work-20260513-deterministic-audit-repair-source-inconclusive
- Related intake: work-20260513-audit-evidence-relevance-gate
