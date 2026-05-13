# Implement Workflow Pack Registry And Feature Canary

- Task ID: work-20260513-implement-workflow-pack-registry-feature-canary
- Lane: work
- Status: queued
- Priority: critical
- Created: 2026-05-13
- Due: unset
- Source: Follow-up from accepted RDPI plan `docs/rdpi/work/work-20260513-define-workflow-contract-pack-interface/plan.md`.
- RDPI Needed: yes
- RDPI Path: `docs/rdpi/work/work-20260513-implement-workflow-pack-registry-feature-canary`

## Request

Implement the smallest development slice from the accepted workflow contract pack plan:

- Add a shared workflow pack registry with a minimal `WorkflowPack` interface for task-intent validation.
- Move the existing audit-specific task-intent validation path behind an audit pack without weakening current audit strictness.
- Add a feature-task canary pack that proves a non-audit workflow can pass through the same registry.
- Export the registry surface from the shared package in the narrowest way needed by existing consumers.
- Add a short local KB note documenting how future workflow packs register validation behavior.

## Done When

- Shared code has a typed registry and default audit pack wired into task-intent validation.
- Existing audit roadmap/task-intent validation behavior, failure messages, and strictness remain compatible with current tests.
- A non-audit feature canary is covered by focused tests and does not rely on audit-only roadmap semantics.
- No database schema, runtime persistence, scheduler behavior, or UI/API timeline behavior changes are introduced.
- The RDPI `research.md`, `design.md`, and `plan.md` pass the independent plan gate before implementation starts.
- Implementation receives independent `TEST PASS` and `REVIEW PASS` verdicts before close-out.

## Constraints

- Do not implement audit roadmap generation/import optional hooks in this task.
- Do not rename or generalize audit evidence ledger storage in this task.
- Do not design or implement generic artifact/claim persistence in this task.
- Do not add finance, analytics, or other real workflow packs beyond the feature canary.
- Preserve local repo facts over memory recall, and do not perform live runtime probing before `PLAN PASS`.

## Notes

- This is the first implementation task after `work-20260513-define-workflow-contract-pack-interface`.
- The accepted plan identified this as the lowest-risk slice because it is shared-library-first and does not require schema changes.
- Follow-up work should be queued separately after this task passes its gates.

## Links

- Parent RDPI plan: `docs/rdpi/work/work-20260513-define-workflow-contract-pack-interface/plan.md`
- Parent RDPI design: `docs/rdpi/work/work-20260513-define-workflow-contract-pack-interface/design.md`
