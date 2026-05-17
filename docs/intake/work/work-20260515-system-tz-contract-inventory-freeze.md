# System TZ Contract Inventory And Freeze

- Task ID: work-20260515-system-tz-contract-inventory-freeze
- Lane: work
- Status: queued
- Priority: critical
- Created: 2026-05-15
- Due: before implementing System TZ platform slices
- Source: `C:\Users\apron\Desktop\aif_handoff_system_tz.md`, sections 2, 3, 23 Phase 0, 27
- RDPI Needed: yes
- RDPI Path: docs/rdpi/work/work-20260515-system-tz-contract-inventory-freeze

## Request

Create a reviewed inventory and freeze document for the current AIF Handoff workflow contracts before changing platform behavior.

Map the existing task intents, artifact states, evidence events, workflow timeline DTOs, memory tables, runtime usage events, orchestration services, and audit-specific validators to the target trust backbone described in the System TZ.

## Done When

- Current task intent behavior is documented across shared types, data persistence, API, MCP, web, chat, planner, implementer, reviewer, and audit flows.
- Current artifact states, artifact attempts, evidence events, timeline rows, memory records, usage events, branch/worktree fields, and review findings are mapped to target concepts.
- Duplicated, obsolete, or audit-specific code paths that currently leak into generic workflow behavior are listed with file references.
- Open questions from the TZ are converted into either blocked decisions or explicit follow-up tasks.
- The output can be used as the accepted planning source for the rest of the System TZ tasks.

## Constraints

- Inventory only; do not change runtime behavior in this task.
- Do not run live server probes before PLAN PASS.
- Local repo facts outrank memory and external recall.
- Do not weaken or bypass any existing audit validator.

## Notes

- This is the Phase 0 prerequisite for the System TZ migration plan.
- Existing completed work such as workflow contract packs, artifact timelines, audit evidence ledger, server-side memory, and audit trust UI should be treated as current facts, not duplicated from scratch.
