# Add Audit Evidence Ledger For Runtime Evidence

- Task ID: work-20260512-audit-evidence-ledger
- Lane: work
- Status: done
- Priority: high
- Created: 2026-05-12
- Due: unset
- Source: audit evidence provenance review
- RDPI Needed: yes
- RDPI Path: docs/rdpi/work/work-20260512-audit-evidence-ledger

## Request

Add an audit-safe evidence ledger for runtime inspection evidence so reports can cite actual file reads, searches, shell commands, static checks, and test runs without logging full raw tool responses.

The ledger should capture bounded, redacted, verifiable facts: evidence id, task id, audit plan id, source snapshot id, tool name, scope ids, risk hypothesis ids, evidence kind, evidence grade, path/range hashes, command metadata, exit code, output hashes, bounded previews, and parsed summaries.

## Done When

- Runtime/tool activity can emit audit evidence events for at least file read, search, and shell command inspection.
- Inventory commands are classified as discovery evidence and cannot be upgraded to substantive no-findings evidence.
- Shell/search outputs are captured as hashes plus bounded redacted previews or parsed summaries, not full unsafe payload logs.
- Secret-like output handling is explicitly designed and tested.
- Reports can cite evidence ids, and validator can verify that cited ids belong to the same task, audit plan, and source snapshot.
- Fake markdown command output cannot satisfy command evidence without a matching runtime-captured evidence event.

## Constraints

- Follow RDPI before implementation.
- Do not execute this task during intake.
- Preserve the existing safety decision in activity logging that avoids raw response payload logging.
- Keep evidence storage bounded and reviewable.
- Start with read/search/shell; do not block on every runtime tool type.

## Notes

- Current `agentActivityLog` records tool name and concise input details.
- Current hook logging intentionally avoids response content to keep logs small and safe.
- This task should introduce a separate audit evidence extraction layer, not turn the general activity log into a raw transcript store.

## Links

- Parent architecture intake: work-20260512-audit-evidence-provenance-contract
- Related intake: work-20260512-structured-audit-report-manifest
