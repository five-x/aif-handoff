# Research

## Task Framing And Lane

- Task ID: `work-20260530-roadmap-microtask-decomposition-contract`.
- Lane: `work`.
- RDPI needed: yes.
- Intake intent: harden roadmap generation and split flows so executable children are microtasks with narrow implementation boundaries.
- Scope is proposal-time roadmap and split behavior. The task is not to implement the `zai-mi.com` project, change its business requirements, or replace the existing task-size gate.

## Accepted Planning Sources Or Local Facts

- `docs/intake/work/work-20260530-roadmap-microtask-decomposition-contract.md` is the immutable task intent. It specifically calls out the blocked `zai-mi.com` child that combined application skeleton, local dev stack, and baseline configuration.
- `docs/rdpi/work/work-20260528-roadmap-split-required/result.md` records the existing split proposal lifecycle: roadmap import/generation now returns `split_required`, approval creates paused hierarchy tasks, and no task rows are created during import/generation.
- `docs/rdpi/work/work-20260530-task-size-gate-before-implementation/result.md` records the existing late guard: `task_size_split_required` blocks broad executable cards before implementation and surfaces `split_required:` feedback.
- `packages/api/src/services/roadmapGeneration.ts` owns generic and typed roadmap generation/extraction, split proposal persistence, conversion from generated roadmap tasks to proposed children, and approval-time import into task rows.
- `packages/api/src/routes/projects.ts` wires roadmap import/generation endpoints, `roadmap:split_required` broadcasts, and split proposal approve/reject endpoints.
- `packages/data/src/index.ts` persists `task_split_proposals`; approval delegates task creation to `importGeneratedTasks`.
- `packages/shared/src/types.ts` defines `TaskSplitProposedChild` with title, description, intent, phase, sequence, and tags only. It has no structured file boundary, acceptance check, verification command, or dependency metadata fields.
- `packages/shared/src/planQuality.ts` contains deterministic broad-task checks, but those checks currently run at plan/pre-implementation time, after a proposal can already be approved into executable task rows.
- `packages/shared/src/taskIntentContracts.ts` currently describes `general` decomposition as preserving broad roadmap behavior, which conflicts with the new requirement that executable children be microtasks.
- Existing tests cover split proposals and task-size gates, but current roadmap split tests use trivial children such as `Build split child`; they do not prove a `zai-mi.com`-like scaffold/dev-stack/config task is decomposed before approval.

## Independent Explorer Notes

The required read-only explorer confirmed:

- Generic roadmap generation still encourages high-level milestones.
- `toProposedChildren()` maps generated tasks directly into proposal children.
- Broad proposed children are caught late by pre-implementation gates rather than before proposal approval.
- Approval can still wake children when the compatibility flag disables pause-by-default.
- Recommended implementation target is proposal-time microtask validation/decomposition with regressions for a `zai-mi.com`-like scaffold/config/dev-stack card.

## Same-Project Memory

Not used before `PLAN PASS` because the project RDPI boundary forbids shared-memory recall before plan review unless explicitly waived. Local RDPI artifacts and repo files were sufficient for planning.

## Cross-Project Reusable Patterns

Not used. No cross-project pattern is needed beyond the local roadmap split and task-size gate contracts.

## Rejected Or Stale Memory Candidates

- No memory candidates were recalled.
- The older broad generic roadmap behavior is treated as stale for executable child creation because this task explicitly supersedes it for implementation-ready children while still allowing broad non-executable parent summaries.
