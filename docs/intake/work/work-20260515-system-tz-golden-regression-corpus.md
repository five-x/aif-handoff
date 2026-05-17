# System TZ Golden Regression Corpus

- Task ID: work-20260515-system-tz-golden-regression-corpus
- Lane: work
- Status: queued
- Priority: high
- Created: 2026-05-15
- Due: before declaring System TZ platform hardening complete
- Source: `C:\Users\apron\Desktop\aif_handoff_system_tz.md`, sections 22, 23, 24
- RDPI Needed: yes
- RDPI Path: docs/rdpi/work/work-20260515-system-tz-golden-regression-corpus

## Request

Build a golden corpus and mutation regression strategy for critical validators and known System TZ failure families.

The test suite should prove that weak audit reports, out-of-scope development diffs, missing verification, unclosed blockers, unsafe shell commands, and stale rework patterns cannot pass silently.

## Done When

- Golden corpus structure covers plans, implementations, reviews, audit reports, memory, and timeline artifacts.
- Audit invalid cases include inventory_only_no_findings, mass_line_one_citations, fake_command_output, missing_evidence_ref, manifest_snapshot_mismatch, scope_mismatch, risk_mismatch, and source_inconclusive.
- Development invalid cases include feature_out_of_scope_diff, fix_without_regression, docs_source_change, tests_no_run_output, review_unclosed_blocker, and unsafe_shell_command.
- Mutation tests remove or alter evidence refs, source snapshots, substantive commands, test output, changed files outside scope, acceptance criteria, and blocker closure proof, and validators fail as expected.
- Unit and integration coverage targets task intent inference, state machine, plan manifest validation, completion guard, audit classifier, audit report validator, workflow timeline rollup, memory redaction, runtime resolution, and permission policy.
- No known audit-v9 style weak report, source-changing docs task, or rework without delta can pass.

## Constraints

- Do not rely on live server evidence for deterministic corpus tests.
- Do not weaken validators to make fixtures pass.
- Keep fixtures redacted and non-secret.

## Notes

- This card is a cross-cutting verification lane for the System TZ.
