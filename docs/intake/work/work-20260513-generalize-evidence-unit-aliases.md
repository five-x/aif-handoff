# Generalize Evidence Unit Aliases For Audit Ledger

- Task ID: work-20260513-generalize-evidence-unit-aliases
- Lane: work
- Status: queued
- Priority: high
- Created: 2026-05-13
- Due: unset
- Source: Follow-up from accepted RDPI plan `docs/rdpi/work/work-20260513-define-workflow-contract-pack-interface/plan.md`.
- RDPI Needed: yes
- RDPI Path: `docs/rdpi/work/work-20260513-generalize-evidence-unit-aliases`

## Request

Generalize audit evidence ledger naming to core evidence unit aliases while preserving audit table compatibility.

- Introduce a generic evidence unit vocabulary at the shared/API boundary where it reduces audit-only coupling.
- Preserve existing audit ledger storage compatibility and audit report behavior.
- Keep audit-specific fields available through compatibility aliases until a later migration explicitly retires them.
- Add focused tests proving existing audit evidence flows still work.

## Done When

- Generic evidence unit aliases are available in the narrow code paths selected by RDPI.
- Existing audit evidence ledger behavior remains compatible with current tests and stored shape expectations.
- Any new naming is additive or compatibility-preserving; destructive renames are out of scope.
- No generic artifact/claim persistence, UI timeline work, or database table rename is included.
- Independent RDPI plan, test, and review gates pass before close-out.

## Constraints

- Depends on `work-20260513-implement-workflow-pack-registry-feature-canary`.
- Prefer additive aliasing over migration unless RDPI proves a migration is necessary and safe.
- Preserve audit evidence relevance and provenance semantics.
- Do not perform live runtime probing before `PLAN PASS`.

## Notes

- This task prepares evidence terminology for non-audit workflows without changing audit history semantics.
- It should stay smaller than generic artifact/claim persistence.

## Links

- Parent RDPI plan: `docs/rdpi/work/work-20260513-define-workflow-contract-pack-interface/plan.md`
- Related audit ledger task: `docs/intake/work/work-20260512-audit-evidence-ledger.md`
