# Plan

## Implementation Steps

1. Extend the split proposal child type in `packages/shared/src/types.ts` with optional microtask metadata: file boundaries, acceptance criteria, verification commands, dependencies, and split rationale.
2. Update `packages/shared/src/taskIntentContracts.ts` so the `general` contract no longer permits broad implementable roadmap children.
3. Add roadmap proposal microtask helpers in `packages/api/src/services/roadmapGeneration.ts`:
   - classify broad executable proposed children;
   - decompose scaffold/dev-stack/config/app-code children into deterministic microtasks;
   - enrich narrow children with metadata;
   - validate proposed children before approval/import.
4. Wire the helpers into `createRoadmapSplitProposal()` and `approveRoadmapSplitProposal()` so generated/imported proposals are normalized and stale broad proposals fail closed at approval.
5. Update generic roadmap generation and extraction prompts in `roadmapGeneration.ts` so parent roadmap summaries may be broad, but executable extracted children must be microtasks with Scope, Acceptance criteria, Verification, and Dependencies.
6. Add focused regressions:
   - service-level `zai-mi.com`-like broad child decomposes into multiple microtasks before persistence;
   - route-level roadmap import returns a split proposal whose proposed children are microtasks and approval creates only those children;
   - approval rejects a stale broad proposal and creates no task rows;
   - existing narrow split proposal behavior still works.
7. Run focused validation first, then broader repo validation as feasible:
   - `npm.cmd test --workspace=@aif/api -- --run src/__tests__/roadmapGeneration.test.ts src/__tests__/projects.test.ts`
   - `npm.cmd test --workspace=@aif/shared -- --run src/__tests__/planQuality.test.ts`
   - `npm.cmd run format:check`
   - `npm.cmd run lint`
   - `npm.cmd test`
   - `npm.cmd run build`

## Scope Boundaries

- In scope: roadmap split proposal payloads, proposal-time normalization/validation, approval backstop, prompts, and tests.
- Out of scope: implementing `zai-mi.com`, changing audit workflow pack semantics, replacing the existing task-size gate, broad UI redesign, or adding a new durable dependency graph schema.

## Acceptance Mapping

- Broad project scaffold phase decomposes before a child can run: proposal normalization splits scaffold/dev-stack/config/app-code children, and approval rejects stale broad children.
- Each executable child has bounded details: structured metadata carries outcome, boundaries, acceptance checks, verification, and dependencies.
- Monolithic executable children are rejected: approval-time validation is fail-closed.
- Roadmap generation and manual split proposal paths share the same microtask helper.
- Broad phase summaries remain possible as non-executable containers because only executable proposed children are normalized/validated.

## Independent Gates

- Required plan review: independent reviewer must return `PLAN PASS` before implementation.
- Required test gate: independent tester must return `TEST PASS` after implementation.
- Required final review: independent reviewer must return `REVIEW PASS` before close-out.

## Open Questions

- None blocking. The metadata fields are optional for compatibility, but the service will populate and enforce them for roadmap split proposals created after this change.
