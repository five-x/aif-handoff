# Agent Hardening Observability Events

- Task ID: work-20260602-agent-hardening-observability-events
- Lane: work
- Status: queued
- Priority: high
- Created: 2026-06-02
- Due: TBD
- Source: Follow-up from work-20260602-aif-agent-workflow-stabilization
- RDPI Needed: yes
- RDPI Path: docs/rdpi/work/work-20260602-agent-hardening-observability-events

## Request

Add observability counters/events for the hard runtime and evidence guardrails introduced by agent workflow stabilization.

## Done When

- Metrics or structured events exist for `agent_tool_loop_blocked_total`, `agent_checklist_incomplete_block_total`, `agent_invalid_manifest_rejected_total`, `agent_same_failure_fail_closed_total`, `agent_split_required_decision_total`, `agent_prompt_contract_missing_total`, and `agent_write_path_denied_total`.
- Each event includes task id, stage, workflow kind, runtime profile id, tool name when applicable, artifact path when applicable, fingerprint/failure fingerprint, and action.
- Activity log remains readable and does not expose raw provider diagnostics.
- Unit tests prove representative event emission for key guardrails.

## Constraints

- Do not introduce high-cardinality raw prompt/provider payloads into metrics.
- Do not replace existing timeline/activity events without migration coverage.
