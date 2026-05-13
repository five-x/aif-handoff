# Harden Typed Roadmap Content Validation

- Task ID: work-20260510-harden-typed-roadmap-content-validation
- Lane: work
- Status: done
- Priority: high
- Created: 2026-05-10
- Due: unset
- Source: user request after live roadmap audit-card verification
- RDPI Needed: yes
- RDPI Path: docs/rdpi/work/work-20260510-harden-typed-roadmap-content-validation

## Request

Harden typed roadmap generation and import so the descriptive content of generated cards always matches the selected `taskIntent`, not just the persisted task fields and defaults.

The live `audit` roadmap test created cards with correct system fields (`taskIntent: audit`, full planner mode, review enabled, subagents enabled, and diagnostic tags), but the source roadmap and card descriptions still contained implementation-shaped milestones such as bug resolution, architecture refactoring, security hardening, and test-suite expansion. The generated descriptions also used `Allowed changes: None` while requiring the agent to create and commit an audit report artifact, which is internally contradictory.

## Done When

- Typed roadmap generation is fail-closed when the model returns a roadmap that does not match the requested `taskIntent`.
- For `taskIntent: audit`, the source `ROADMAP.md` is validated before extraction/import and must be diagnostic-only.
- Audit roadmap validation rejects implementation-shaped milestones such as fixing, resolving, implementing, refactoring, hardening, expanding tests, deploying, or documenting unless they are explicitly framed as diagnostic findings/reporting work.
- Audit roadmap validation requires report artifact paths, diagnostic-only constraints, evidence/risk/verification requirements, git commit verification, and exactly one final synthesis card.
- Audit generated-card validation rejects `Allowed changes: None` and requires allowed changes to be limited to creating/updating the report artifact.
- A prefix such as `Audit:` cannot mask an implementation-shaped title or description.
- Roadmap import validates the entire batch before creating any task; if one generated task is invalid, no tasks from that batch are created.
- API/UI surface an actionable error such as “Audit roadmap generation produced implementation-shaped milestones; no tasks imported.”
- Generic roadmap behavior remains available for `general` intent and is not accidentally made audit-only.
- Focused tests cover the observed bad roadmap terms: `Critical Bug Resolution`, `Architecture Refactoring`, `Security Hardening`, `Test Suite Expansion`, and `Allowed changes: None`.
- RDPI result records the validation rules, user-visible failure behavior, test commands, and any migration notes after execution.
- Independent `TEST PASS` and `REVIEW PASS` gates pass before close-out.

## Constraints

- Intake only for this turn; do not implement this task yet.
- Follow RDPI before implementation.
- Before `PLAN PASS`, do not perform live server checks, live roadmap generation, runtime profile mutation, scheduler/log probing, or shared-memory recall unless the user explicitly waives that boundary.
- Do not create and execute child implementation tasks in the same run.
- Keep validation deterministic where practical; prompt wording alone is not enough.
- Preserve existing valid typed-intent behavior and generic roadmap behavior.
- Keep changes diffable, reviewable, and covered by focused tests.
- Keep raw secrets out of repository files, task logs, and shared memory.

## Notes

- The triggering live batch was `roadmapAlias: audit` on project `botIntevra`, created on 2026-05-10.
- The system fields were correct; the gap is content validation and source-roadmap validation.
- Prefer fail-closed over silently rewriting a bad typed roadmap into executable cards.

## Links

- RDPI scaffold: ../../rdpi/work/work-20260510-harden-typed-roadmap-content-validation
