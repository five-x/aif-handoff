# Complete Requirements Intake Lifecycle After MVP

- Task ID: work-20260528-requirements-intake-remaining-phases
- Lane: work
- Status: next
- Priority: critical
- Created: 2026-05-28
- Due: unset
- Source: follow-up from `work-20260528-requirements-intake-mvp` and `C:/Users/apron/Desktop/tz_requirements_intake_clarification_loop (1).md`
- RDPI Needed: yes
- RDPI Path: docs/rdpi/work/work-20260528-requirements-intake-remaining-phases

## Request

Finish the remaining Requirements Intake & Clarification Loop work after the Phase 1 MVP. Treat the already implemented MVP as the baseline and plan the remaining platform feature work without re-implementing the completed core clarification loop unless research finds gaps.

The remaining implementation should cover:

- Phase 2: requirements snapshots, research/design runners, stage artifact persistence, artifact UI, and validation gates.
- Phase 3: QA status/gate, QA runner, QA artifact, result/acceptance pack, review-to-QA flow, and done acceptance UI.
- Phase 4: roadmap/epic decomposition through `split_required`, proposed child task contract, controlled approval UI, and parent/child handling.
- Cross-cutting hardening: downstream agent contracts for `raise_questions`, snapshot/design/plan linkage, observability, docs, rollout flags, compatibility behavior, and regression/e2e coverage.

## Done When

- Tasks cannot reach downstream stages without the required current requirements snapshot or an explicit documented waiver.
- Non-trivial tasks produce and expose `requirements.md`, `research.md`, and `design.md` artifacts through backend metadata and UI.
- Planner, implementer, reviewer, and QA stages reference the requirements snapshot and relevant upstream artifacts.
- Stage agents can raise structured blocking questions from research/design/implementation/review/QA and resume to the correct target stage after answers.
- `review -> qa -> done` is enforced when QA is enabled, and direct `review -> done` is blocked.
- QA produces `qa.md`, records command evidence/skips with reason and risk, and blocks done on failed mandatory checks.
- Done produces a result/acceptance pack showing covered requirements, changed files, review result, QA result, limitations, rollback notes, and readiness for human acceptance.
- `verified` remains reachable only through human approval.
- Roadmap items that are too broad can return `split_required` and require controlled approval before child tasks are created.
- Unit, integration, and UI/e2e tests cover the remaining lifecycle paths and preserve compatibility mode.
- Documentation is updated in architecture/configuration/runbook materials.

## Constraints

- Intake-only card. Do not execute implementation as part of this intake turn.
- Preserve the Phase 1 MVP behavior already committed in `6565e2f8`.
- Keep `needs_input` distinct from `blocked_external`; product clarification must not be modeled as infrastructure failure.
- Do not store raw user answers or secrets in shared memory.
- Preserve backward compatibility when `AIF_REQUIREMENTS_INTAKE_ENABLED=false`.
- Follow RDPI gates before implementation: research, design, plan, independent plan review, implementation, independent test and review gates.
- Split into child implementation cards only after this umbrella task is accepted or during its RDPI plan if the scope is too large for one safe implementation run.

## Notes

Suggested child slices for later decomposition:

- `requirements-snapshot-and-stage-artifacts`: data model, artifact service, snapshot versioning, artifact tab, validation.
- `research-design-stages`: runners, prompts/contracts, coordinator transitions, artifact validation gates.
- `qa-gate-and-acceptance-pack`: QA status, runner, result pack, review-to-QA flow, acceptance UI.
- `late-stage-question-resume`: unified `raise_questions` contract across agents and target resume stage routing.
- `roadmap-split-required`: split decision contract, parent/child approval flow, roadmap import integration.
- `observability-docs-rollout`: structured logs, metrics, config docs, runbook, rollout/canary coverage.

## Links

- Completed MVP RDPI: ../../rdpi/work/work-20260528-requirements-intake-mvp
- Source TZ: C:/Users/apron/Desktop/tz_requirements_intake_clarification_loop (1).md
