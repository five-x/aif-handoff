# System TZ Chat MCP Attachments Gates

- Task ID: work-20260515-system-tz-chat-mcp-attachments-gates
- Lane: work
- Status: queued
- Priority: medium
- Created: 2026-05-15
- Due: after core workflow gates are stable
- Source: `C:\Users\apron\Desktop\aif_handoff_system_tz.md`, sections 16, 17, 18, 25 P2
- RDPI Needed: yes
- RDPI Path: docs/rdpi/work/work-20260515-system-tz-chat-mcp-attachments-gates

## Request

Make chat, MCP sync, and attachments first-class workflow entrypoints that cannot bypass task state machine, task intent contracts, review gates, completion guards, or source provenance.

## Done When

- Chat can discuss projects, read task context, create task proposals, create follow-ups, start explore mode, explain blockers, and prepare replan proposals through structured actions.
- Chat cannot silently mutate verified memory, bypass state machine, approve done, or bypass review/security/completion guards.
- Chat-created tasks infer or preserve task intent and source references.
- MCP task operations use the same task state machine, validate task intent, validate artifact paths, create timeline events, broadcast sync events, preserve sourceRef, and do not bypass guards.
- MCP-created tasks appear in UI immediately and invalid MCP artifact paths are rejected.
- Attachments enforce max size, mime validation, safe storage paths, path traversal defense, redaction/scanning, bounded prompt formatting, task/comment provenance, and safe binary handling.

## Constraints

- Destructive or mutating chat actions require UI confirmation.
- Large attachments must not be fully inlined into prompts.
- Binary attachments must not be treated as text.
- Unsafe filenames must be rejected.

## Notes

- This is intentionally P2 because it should sit on top of the core trust and gate model.
