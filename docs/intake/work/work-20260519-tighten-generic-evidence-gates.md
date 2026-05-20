# Tighten Generic Evidence Gates

- Task ID: work-20260519-tighten-generic-evidence-gates
- Lane: work
- Status: queued
- Priority: high
- Created: 2026-05-19
- Due: after lifecycle and retry normalization
- Source: Follow-up from `docs/rdpi/work/work-20260519-systemic-task-lifecycle-review/result.md`.
- RDPI Needed: yes
- RDPI Path: `docs/rdpi/work/work-20260519-tighten-generic-evidence-gates`

## Request

Close the remaining evidence gaps that can let non-audit or generic tasks appear complete without the proof required by the OTZ.

## Done When

- Inferred development/fix/docs/test tasks require the same implementation manifest evidence as explicit development tasks, or completion requires normalized task intent first.
- `classifyAuditCardDecision()` cannot return `closed_verified` with empty implementation or verification evidence arrays.
- Waived acceptance criteria require explicit waiver authority/evidence or block normal `closed_verified`.
- TaskDetail active queue display matches scheduler queue-gating semantics or explicitly separates execution-active from queue-gating counts.
- Shared/API/data/web regression tests cover the new behavior.

## Constraints

- Do not weaken existing development evidence guard requirements.
- Do not make audit weak/discarded findings block a validated no-findings result by themselves.
