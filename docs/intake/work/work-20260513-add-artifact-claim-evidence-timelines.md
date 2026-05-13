# Add Artifact Claim And Evidence Timelines

- Task ID: work-20260513-add-artifact-claim-evidence-timelines
- Lane: work
- Status: queued
- Priority: medium
- Created: 2026-05-13
- Due: unset
- Source: Follow-up from accepted RDPI plan `docs/rdpi/work/work-20260513-define-workflow-contract-pack-interface/plan.md`.
- RDPI Needed: yes
- RDPI Path: `docs/rdpi/work/work-20260513-add-artifact-claim-evidence-timelines`

## Request

Add UI/API surfaces for generic artifact, claim, and evidence timelines after generic persistence has an accepted design and implementation path.

- Expose timelines that can show artifact attempts, claim status, evidence links, and inconclusive outcomes across workflow packs.
- Keep audit timelines compatible with existing audit artifacts and evidence.
- Avoid audit-only labels in generic surfaces while preserving audit-specific details where appropriate.
- Cover backend API behavior and frontend rendering with focused tests.

## Done When

- API surfaces expose generic artifact, claim, and evidence timeline data selected by RDPI.
- UI surfaces render the timeline clearly for audit-compatible data and at least one non-audit workflow shape.
- Existing audit views and tests remain compatible.
- The implementation follows the accepted generic persistence design or explicitly blocks if that design is not yet accepted.
- Independent RDPI plan, test, and review gates pass before close-out.

## Constraints

- Depends on accepted persistence design from `work-20260513-design-generic-artifact-claim-persistence`.
- Do not invent persistence semantics inside the UI/API task if the persistence design is incomplete.
- Do not weaken audit evidence, artifact, or claim compatibility.
- Do not perform live runtime probing before `PLAN PASS`.

## Notes

- This is intentionally queued after persistence design because UI/API timelines need stable data contracts.
- If persistence implementation becomes a separate accepted task, this card should wait for it.

## Links

- Parent RDPI plan: `docs/rdpi/work/work-20260513-define-workflow-contract-pack-interface/plan.md`
- Persistence design task: `docs/intake/work/work-20260513-design-generic-artifact-claim-persistence.md`
