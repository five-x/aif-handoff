# Plan

## Implementation

1. Extend shared workflow trust vocabulary.
   - Add generic artifact kind constants/types in `packages/shared/src/types.ts`.
   - Add a task-record source kind.
   - Add generic next-action values and preserve existing audit values.

2. Refactor data-layer timeline construction.
   - Keep roadmap artifact timeline construction intact.
   - Replace the non-audit empty-envelope path in `buildTaskWorkflowTimeline()` with a generic task-record projection.
   - Add helpers for generic artifacts, attempts, claims, evidence rows, evidence links, events, trust mapping, and reason-code/failure-signature construction.
   - Include memory candidate rows by `sourceTaskId`.
   - Ensure trusted generic artifacts always have an attempt.
   - Ensure blockers produce a claim and evidence link.

3. Extend data-layer rollups.
   - Keep existing roadmap `buildTaskArtifactTrustRollup()` path first.
   - Add fallback rollup over generic task-record projection.
   - Populate all existing `TaskArtifactTrustRollup` fields, including next action, reason codes, branch/worktree, attempt number, failure signature, and counts.

4. Update focused tests.
   - Replace data-layer empty non-audit timeline expectations with generic feature/fix/docs/tests/spike artifact expectations.
   - Assert every trusted generic artifact has at least one matching attempt row.
   - Add a blocked-task test proving blocker evidence links to a claim.
   - Add rollup tests proving non-audit trusted/weak/untrusted states, and that done/untrusted is still untrusted.
   - Preserve or add an audit manual-exception regression proving operator justification remains required and surfaced.
   - Update API timeline tests for generic non-audit responses.
   - Update web timeline/header tests only where the new generic payload changes expectations.

5. Verify.
   - Run focused data tests.
   - Run focused API tests.
   - Run focused web tests if UI expectations changed.
   - Run `npm.cmd run build`.
   - Run `npm.cmd run lint`.
   - Run `git diff --check`.

## Acceptance criteria

- Generic artifact types cover plan, plan manifest, implementation manifest, source diff, test result, review report, security report, audit report, audit synthesis, memory candidate, and commit evidence.
- Claim outcomes still include supported, refuted, inconclusive, blocked, waived, and not_evaluated.
- Trust levels still include trusted, weak, and untrusted.
- Non-audit tasks can return a populated `WorkflowTimeline` with artifacts, attempts, claims, evidence, evidence links, events, and task-record context.
- Non-audit tasks can return `TaskArtifactTrustRollup` in task route responses.
- Trusted artifacts have attempts.
- Blocked generic tasks can be traced to a claim and evidence link.
- Existing audit/roadmap timeline, trust rollup, synthesis readiness, and manual exception behavior remain compatible.

## Planned verification commands

- `npm.cmd test --workspace=@aif/data -- --run src/__tests__/workflowTimeline.test.ts src/__tests__/index.test.ts`
- `npm.cmd test --workspace=@aif/api -- --run src/__tests__/tasks.test.ts`
- `npm.cmd test --workspace=@aif/web -- --run src/__tests__/WorkflowTimelinePanel.test.tsx src/__tests__/TaskDetailHeader.test.tsx`
- `npm.cmd run build`
- `npm.cmd run lint`
- `git diff --check`
