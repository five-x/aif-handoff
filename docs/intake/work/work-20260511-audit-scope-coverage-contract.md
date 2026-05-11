# Audit Scope Coverage Contract

- Task ID: work-20260511-audit-scope-coverage-contract
- Lane: work
- Status: done
- Priority: high
- Created: 2026-05-11
- Due: unset
- Source: follow-up from `work-20260511-audit-quality-system-analysis`
- RDPI Needed: yes
- RDPI Path: docs/rdpi/work/work-20260511-audit-scope-coverage-contract

## Request

Make declared audit scope machine-checkable so reports prove they inspected the scoped product areas, not just convenient documentation files.

## Done When

- Task descriptions with `Scope:` lines are parsed into explicit scope roots.
- For scoped files, reports must cite concrete existing `path:line` evidence.
- For scoped directories, reports must cite representative concrete files under that directory plus command/tool evidence.
- A report that cites only `README.md`, `AGENTS.md`, and `pyproject.toml` fails when scope includes source directories such as `src` or package modules.
- Large directories require representative coverage, not exhaustive line-by-line inspection.
- Positive tests cover valid findings and valid no-findings reports with scope coverage.

## Constraints

- Platform-level `aif-handoff` fix; no project-specific path assumptions.
- Do not require impossible exhaustive coverage for large repositories.
- Keep blocked reasons actionable so an agent can repair the report.

## Links

- Parent analysis: ../../rdpi/work/work-20260511-audit-quality-system-analysis
