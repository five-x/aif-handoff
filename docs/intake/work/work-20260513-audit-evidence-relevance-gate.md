# Audit Evidence Relevance Gate

- Task ID: work-20260513-audit-evidence-relevance-gate
- Lane: work
- Status: done
- Priority: critical
- Created: 2026-05-13
- Due: unset
- Source: audit-v10 quality review
- RDPI Needed: yes
- RDPI Path: docs/rdpi/work/work-20260513-audit-evidence-relevance-gate

## Request

Harden audit report validation and classification so evidence must be relevant to the declared audit scope and risk hypotheses. Existing checks accepted line references and command output that resolved under the repository but did not prove anything about the audit mandate.

## Done When

- A trusted no-findings source report requires non-empty risk hypotheses or equivalent scoped no-findings claims.
- Evidence refs must belong to the same task, audit plan, source snapshot, and relevant scope/risk.
- `Scope: .` is either rejected for source audit reports or requires representative product-scope coverage rather than first arbitrary files.
- `.agents/**`, `.ai-factory/**`, generated plans, and report artifacts do not count as product-code evidence unless explicitly scoped by the audit mandate.
- `path:1` citations are not sufficient when they only prove file existence or metadata headers.
- Validation details explain whether failure is missing scope, missing risk hypotheses, irrelevant evidence, or insufficient substantive evidence.

## Constraints

- Follow RDPI before implementation.
- Do not execute this task during intake.
- Keep positive fixtures for valid no-findings reports so the classifier does not become unusably strict.
- Reuse shared audit classifier modules rather than adding another one-off gate.

## Notes

- The validator currently treats broad directory coverage as representative files plus command evidence.
- audit-v10 showed that technically existing evidence can still be semantically irrelevant.

## Links

- Related intake: work-20260512-audit-contract-corpus
- Related intake: work-20260513-audit-v10-false-valid-regression
