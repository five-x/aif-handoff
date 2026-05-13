# Split Broad Audit Requests Into Micro Report Cards

- Task ID: work-20260513-split-broad-audit-requests-into-micro-report-cards
- Lane: work
- Status: queued
- Priority: critical
- Created: 2026-05-13
- Due: unset
- Source: Plan B after audit-v12 rework loop and poor task decomposition
- RDPI Needed: yes
- RDPI Path: unset

## Request

Add an audit decomposition path that splits broad audit requests into smaller source-report cards before final synthesis.

The system should detect when an audit request is too broad for one implementation/review loop, create scoped child audit cards, and only allow the parent synthesis to close after child reports produce validated or explicitly inconclusive outputs.

## Done When

- Broad audit requests are classified before execution as requiring decomposition.
- The planner emits child audit scopes with clear boundaries, expected evidence, and acceptance criteria.
- Parent tasks track child completion and do not synthesize from missing or weak child outputs.
- Child tasks can be retried independently without restarting the full parent audit.
- Final parent synthesis explains which child reports passed, failed, or remained inconclusive.
- Tests cover a broad audit split into child reports and parent synthesis gating.

## Constraints

- Follow RDPI before implementation.
- Do not execute this task during intake.
- Do not create child implementation tasks in the same run that only discovers the need for decomposition unless that behavior is explicitly designed and gated.
- Preserve current single-card audit behavior for narrow audits.
- Avoid schema churn until the plan proves the smallest viable model.

## Notes

- This is Plan B's core decomposition change.
- It should make review ping-pong less likely by shrinking the implementation surface per review loop.

## Links

- Depends conceptually on: work-20260513-terminalize-stalled-audit-rework-loops
- Related planning question: hierarchical task and subtask model
