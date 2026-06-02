# Strict Planner Decision Contract

- Task ID: work-20260602-strict-planner-decision-contract
- Lane: work
- Status: queued
- Priority: critical
- Created: 2026-06-02
- Due: TBD
- Source: Follow-up from work-20260602-aif-agent-workflow-stabilization
- RDPI Needed: yes
- RDPI Path: docs/rdpi/work/work-20260602-strict-planner-decision-contract

## Request

Add a strict fenced `aif-planning-decision` contract for planner decisions so broad tasks return machine-readable `split_required`, `needs_input`, or `blocked` states instead of pseudo-runnable markdown plans.

## Done When

- Planner output parser validates exactly one fenced `aif-planning-decision` JSON block for strict decision mode.
- `decision = split_required` never persists a runnable plan, never sets the parent task to `plan_ready`, and never routes to implementer.
- Split proposals preserve child title, intent, scope, acceptance criteria, verification commands, and forbidden changes.
- Planner retry after quality feedback uses `sessionReusePolicy = "never"`.
- Tests prove a broad task creates a pending split proposal and cannot accidentally become runnable.

## Constraints

- Do not execute child implementation tasks in the same run.
- Do not replace existing roadmap split APIs unless the new parser is integrated safely.
- Enforcement must live in parser/coordinator code, not only prompt text.
