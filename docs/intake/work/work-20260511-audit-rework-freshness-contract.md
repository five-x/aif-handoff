# Audit Rework Freshness Contract

- Task ID: work-20260511-audit-rework-freshness-contract
- Lane: work
- Status: done
- Priority: high
- Created: 2026-05-11
- Due: unset
- Source: follow-up from `work-20260511-audit-quality-system-analysis`
- RDPI Needed: yes
- RDPI Path: docs/rdpi/work/work-20260511-audit-rework-freshness-contract

## Request

Fix audit rework state so `request_changes` cannot be bypassed by stale completion evidence. A reopened report task must either perform fresh report rework or explicitly prove that the rework request is already satisfied after the rework boundary.

## Done When

- `done -> request_changes` on an audit/report task cannot immediately skip the implementer just because previous completion evidence was `ok`.
- Rework validation is tied to a fresh boundary such as latest rework comment timestamp, report content SHA, commit after rework, or equivalent persisted validation evidence.
- Roadmap artifact state cannot remain valid after failed manual QA or a fresh rework request.
- Empty commits are not required; a no-change closure is valid only when it addresses the rework reason and passes the shared validator after the rework boundary.
- Regression tests cover the observed failure: manual request changes is not skipped and does not return unchanged to `done`.

## Constraints

- Do not weaken normal auto-review convergence.
- Keep `blocked_external` for true external/operator blockers.
- Keep rework blocked reasons actionable.

## Links

- Parent analysis: ../../rdpi/work/work-20260511-audit-quality-system-analysis
