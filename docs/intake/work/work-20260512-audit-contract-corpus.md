# Build Audit Contract Corpus And Mutation Tests

- Task ID: work-20260512-audit-contract-corpus
- Lane: work
- Status: done
- Priority: high
- Created: 2026-05-12
- Due: unset
- Source: audit evidence provenance review
- RDPI Needed: yes
- RDPI Path: docs/rdpi/work/work-20260512-audit-contract-corpus

## Request

Build a contract corpus and mutation test strategy for audit classification so future changes cannot regress back to accepting inventory-only no-findings, forged command output, weak line references, missing scope coverage, or contradictory report outcomes.

The corpus should cover invalid reports, valid no-findings reports, valid findings reports, state transitions, and mutations of valid fixtures.

## Done When

- Golden invalid fixtures cover inventory-only commands, file-existence-only claims, mass line-one citations, fake command output, command mismatch, wrong snapshot, line hash mismatch, contradictory findings/no-findings, missing verification, missing scope, and risk without evidence.
- Golden valid no-findings fixtures cover security/config, runtime boundary, persistence ownership, ops/config validation, and architecture boundary examples with substantive evidence.
- Golden valid findings fixtures cover real source evidence, risk, proposed fix, and verification evidence.
- State transition tests prove weak source reports do not increment trusted valid counts and cannot make synthesis ready.
- Mutation tests prove removing evidence ids, risk ids, snapshot ids, absence reasoning, verification, or substantive commands fails with precise failure families.
- Tests are organized so they can evolve from markdown-only fixtures to manifest plus evidence ledger fixtures.

## Constraints

- Follow RDPI before implementation.
- Do not execute this task during intake.
- Include both positive and negative fixtures so the classifier does not become either permissive or unusably strict.
- Prefer deterministic fixture-based tests over model-dependent review text.

## Notes

- Existing tests already include synthesis canaries for inventory-only source reports.
- This task expands the coverage into a reusable contract corpus across source report validation, batch classification, and lifecycle transitions.

## Links

- Parent architecture intake: work-20260512-audit-evidence-provenance-contract
- Related intake: work-20260512-align-source-report-classification
