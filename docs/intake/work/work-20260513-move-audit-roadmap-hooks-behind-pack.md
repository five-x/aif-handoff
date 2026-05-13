# Move Audit Roadmap Hooks Behind Workflow Pack

- Task ID: work-20260513-move-audit-roadmap-hooks-behind-pack
- Lane: work
- Status: queued
- Priority: high
- Created: 2026-05-13
- Due: unset
- Source: Follow-up from accepted RDPI plan `docs/rdpi/work/work-20260513-define-workflow-contract-pack-interface/plan.md`.
- RDPI Needed: yes
- RDPI Path: `docs/rdpi/work/work-20260513-move-audit-roadmap-hooks-behind-pack`

## Request

Move audit roadmap generation and import behavior behind audit workflow pack optional hooks after the workflow pack registry and feature canary have passed.

- Route audit roadmap generation/import validation through audit pack-owned extension points.
- Preserve existing audit roadmap behavior, strictness, and diagnostics.
- Keep non-audit workflow packs free from audit-only roadmap requirements.
- Document the hook ownership boundary for future workflow packs.

## Done When

- Audit roadmap generation/import code delegates pack-owned behavior through the workflow pack interface or a narrow equivalent extension point.
- Existing audit roadmap tests still pass with compatible messages and failure classifications.
- Feature canary behavior remains non-audit and is not rejected for missing audit roadmap fields.
- No database schema, generic artifact persistence, evidence ledger rename, or UI/API timeline work is included.
- Independent RDPI plan, test, and review gates pass before close-out.

## Constraints

- Depends on `work-20260513-implement-workflow-pack-registry-feature-canary`.
- Do not weaken audit report artifact, risk hypothesis, manifest, diagnostic-only, or synthesis outcome requirements.
- Do not introduce finance, analytics, or other real workflow packs in this task.
- Do not perform live runtime probing before `PLAN PASS`.

## Notes

- This is the second implementation slice after the registry/canary task.
- The goal is ownership separation, not new roadmap behavior.

## Links

- Parent RDPI plan: `docs/rdpi/work/work-20260513-define-workflow-contract-pack-interface/plan.md`
- Predecessor task: `docs/intake/work/work-20260513-implement-workflow-pack-registry-feature-canary.md`
