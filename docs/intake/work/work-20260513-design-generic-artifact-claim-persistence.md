# Design Generic Artifact Claim Persistence

- Task ID: work-20260513-design-generic-artifact-claim-persistence
- Lane: work
- Status: queued
- Priority: high
- Created: 2026-05-13
- Due: unset
- Source: Follow-up from accepted RDPI plan `docs/rdpi/work/work-20260513-define-workflow-contract-pack-interface/plan.md`.
- RDPI Needed: yes
- RDPI Path: `docs/rdpi/work/work-20260513-design-generic-artifact-claim-persistence`

## Request

Design generic artifact and claim persistence after the audit pack and feature canary have both passed.

- Define the persistence model for artifacts, claims, evidence links, attempts, and inconclusive outcomes across workflow packs.
- Preserve audit artifact lifecycle compatibility and define any migration path separately.
- Identify API/data boundaries, ownership, indexes, retention expectations, and compatibility constraints.
- Produce an implementation-ready plan without changing runtime persistence in this task.

## Done When

- RDPI artifacts define the chosen persistence design, alternatives considered, and rejected unsafe paths.
- The plan identifies exact schema/API/code surfaces to implement in a later task.
- Audit lifecycle compatibility, feature workflow support, and migration risks are explicitly covered.
- No implementation, database migration, or UI/API timeline surface is created in this design task.
- Independent `PLAN PASS` verdict is recorded before the task can close.

## Constraints

- Depends on `work-20260513-implement-workflow-pack-registry-feature-canary`.
- Should also consider results from `work-20260513-move-audit-roadmap-hooks-behind-pack`.
- Do not create `result.md` or implementation artifacts during intake.
- Do not perform live runtime probing before `PLAN PASS`.

## Notes

- This is intentionally a design task because persistence has a wider blast radius than registry and hooks.
- A later implementation card should be derived from the accepted design, not from assumptions in this intake card.

## Links

- Parent RDPI plan: `docs/rdpi/work/work-20260513-define-workflow-contract-pack-interface/plan.md`
- Related audit artifact task: `docs/intake/work/work-20260512-audit-artifact-lifecycle.md`
