# Model Audit Artifact Attempts And Inconclusive Outcomes

- Task ID: work-20260512-audit-artifact-lifecycle
- Lane: work
- Status: done
- Priority: high
- Created: 2026-05-12
- Due: unset
- Source: repeated audit rework loop analysis
- RDPI Needed: yes
- RDPI Path: docs/rdpi/work/work-20260512-audit-artifact-lifecycle

## Request

Model audit artifact attempts and inconclusive outcomes explicitly so repeated weak source reports do not loop through the same generic task-level review cycle or silently count as valid artifacts.

The lifecycle should distinguish invalid contract, invalid integrity, invalid inventory-only, insufficient substantive evidence, source inconclusive, rework needed, terminal inconclusive, and any manual exception state.

## Done When

- Artifact-level attempt history records attempt number, content SHA, classification outcome, failure family, timestamp, and rework status.
- Repeated same-failure attempts can escalate to manual review or terminal inconclusive according to a clear policy.
- `source_inconclusive` is first-class diagnostic output, but it does not count as trusted valid input for successful synthesis.
- Batch readiness is based on trusted source classifications, not generic `valid` artifact state.
- Terminal inconclusive synthesis is allowed only after attempts are exhausted or explicitly terminalized.
- Any human override path preserves classifier failure reasons and requires explicit human justification.

## Constraints

- Follow RDPI before implementation.
- Do not execute this task during intake.
- Do not silently convert invalid or inconclusive artifacts into `valid`.
- Preserve existing task-level max review iteration behavior until the artifact-level policy has a migration path.
- Keep manual override auditable and fail-closed by default.

## Notes

- Current retry limits are task-level `maxReviewIterations`, not artifact-attempt lifecycle.
- Current batch artifact schema stores generic state, failure family, validation details, branch/worktree/project root, content SHA, and validated timestamp.

## Links

- Parent architecture intake: work-20260512-audit-evidence-provenance-contract
- Related intake: work-20260512-align-source-report-classification
