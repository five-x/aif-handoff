# Terminalize Stalled Audit Rework Loops

- Task ID: work-20260513-terminalize-stalled-audit-rework-loops
- Lane: work
- Status: next
- Priority: critical
- Created: 2026-05-13
- Due: unset
- Source: Plan B after audit-v12 rework loop and max review iteration experiment
- RDPI Needed: yes
- RDPI Path: unset

## Request

Implement a deterministic terminalization guard for audit review/rework loops so an audit task that repeatedly fails for the same unresolved facts does not continue ping-ponging between review and implementation.

The guard should preserve useful rework attempts, but once the same blocking facts remain unresolved across a configured threshold, the task should stop with a clear blocked state and diagnostics instead of burning runtime cycles.

## Done When

- Repeated audit review failures are grouped by stable blocker fingerprints or equivalent structured reasons.
- The task terminalizes when the same blocker family survives the allowed rework budget.
- The blocked state records which facts or acceptance criteria still fail.
- Implementation is not allowed to immediately re-submit a task to review without substantive artifact changes.
- Existing successful audit and feature-development task flows are not regressed.
- Tests cover repeated same-blocker loops, fresh blocker progression, and successful rework.

## Constraints

- Follow RDPI before implementation.
- Do not execute this task during intake.
- Keep the fix local to task lifecycle, review gate, and implementation retry behavior.
- Do not lower `maxReviewIterations`; Plan A currently tests the limit at 100.
- Preserve independent review/test gates.

## Notes

- This is the first Plan B card.
- It addresses the observed pattern where review finds issues, implementation returns almost immediately, and review repeats until the card blocks.

## Links

- Related incident: audit-v12 architecture and ownership boundaries rework loop
- Related hotfix: b0ae06f fix: persist audit repair loop detection
