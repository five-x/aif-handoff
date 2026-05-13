# Introduce Typed Task Intents For Decomposition And Gates

- Task ID: work-20260510-typed-task-intents
- Lane: work
- Status: done
- Priority: high
- Created: 2026-05-10
- Due: unset
- Source: user request via `$intake`
- RDPI Needed: yes
- RDPI Path: docs/rdpi/work/work-20260510-typed-task-intents

## Request

Introduce typed task intents for `audit`, `feature`, `fix`, `spike`, `docs`, and `tests` so each task type has explicit decomposition rules, default task settings, planning prompts, execution constraints, completion evidence, and review/test gates.

The current behavior lets broad natural-language requests flow through generic roadmap/task generation. This caused audit requests to become generic implementation roadmap cards such as fixing bugs, refactoring, hardening, and expanding tests instead of diagnostic-only audit cards. The fix should make intent detection and task decomposition a first-class contract, not a prompt-only convention.

## Done When

- The system has an explicit task-intent model covering at least `audit`, `feature`, `fix`, `spike`, `docs`, and `tests`.
- Each intent has documented defaults for decomposition, `plannerMode`, `skipReview`, `useSubagents`, evidence requirements, allowed file changes, and required gates.
- Audit intent produces only diagnostic-only audit cards plus a synthesis card; it must not produce fix/refactor/hardening/test-expansion implementation cards.
- Feature intent decomposes broad feature requests into small implementable cards with acceptance criteria, verification expectations, and dependency ordering.
- Fix intent preserves a narrow defect-focused flow with reproduction/evidence requirements and regression verification.
- Spike intent produces time-boxed research/design output and does not silently become implementation work.
- Docs intent allows documentation changes with appropriate review/verification, without requiring source-code implementation gates unless explicitly needed.
- Tests intent produces focused test work with clear target behavior, commands, and expected coverage/regression outcomes.
- Roadmap generation/import, direct task creation, planner prompts, implementer prompts, and completion evidence are aligned with the intent contract.
- Invalid or incomplete generated cards fail closed before entering the executable backlog, or are created paused/blocked with actionable validation errors.
- Existing generic roadmap behavior remains available for non-typed general roadmap work, or is migrated behind a `general` intent with explicit constraints.
- Focused automated tests cover intent inference, task import defaults, bad audit-card rejection, feature decomposition defaults, and gate/default differences by intent.
- RDPI `result.md` records the implementation decisions, validation commands, and any migration notes after execution.
- Independent `TEST PASS` and `REVIEW PASS` gates pass before close-out.

## Constraints

- Intake only for this turn; do not implement the typed-intent system yet.
- Follow RDPI before implementation.
- Before `PLAN PASS`, do not inspect live server state, run live roadmap generation, mutate runtime profiles, or create live validation cards.
- Do not create and execute child implementation tasks in the same run.
- Keep changes diffable, reviewable, and explicit.
- Preserve local repo facts over memory or runtime assumptions.
- Keep raw secrets out of repository files, task logs, and shared memory.

## Notes

- This task generalizes the audit-specific failure found while testing project `e4a3a101-ec7f-4f93-9b68-e297ffe8952f`.
- Recent local work already added initial audit-specific guardrails in roadmap generation/import and planner/implementer prompts; RDPI should decide whether to keep, revise, or replace those changes with a broader typed-intent architecture.
- The typed-intent contract should avoid relying only on natural-language prompt wording; validation and defaults should be represented in code and tests.

## Links

- RDPI scaffold: ../../rdpi/work/work-20260510-typed-task-intents
