# Design

## Goal

Roadmap planning may keep broad phase summaries, but any child that can become an executable task row must satisfy a microtask contract before approval can create it.

## Contract

An executable roadmap child is a microtask only when it has:

- A concrete outcome stated in the title and description.
- Bounded implementation surface through explicit file or user-facing surface boundaries.
- Acceptance checks that can be evaluated independently.
- Verification commands or manual checks that are focused to the child.
- Dependency metadata that preserves order without hiding multiple unrelated work areas in one card.

Broad parent/phase summaries may remain broad only when they are non-executable hierarchy containers.

## Proposed Shape

Extend `TaskSplitProposedChild` with optional structured metadata:

- `fileBoundaries: string[]`
- `acceptanceCriteria: string[]`
- `verificationCommands: string[]`
- `dependsOn: string[]`
- `splitRationale?: string`

The existing JSON storage for proposed children can carry these optional fields without a schema migration because proposal children are stored as JSON. Existing clients continue to work, while API and UI can expose richer rationale.

## Proposal-Time Decomposition

Add a deterministic proposal normalizer in `packages/api/src/services/roadmapGeneration.ts` before `createRoadmapSplitProposal()` persists proposal children.

Behavior:

- Detect broad scaffold/dev-stack/config/app-code children using the same dimensions as the task-size gate: broad file boundaries, multiple changed file groups or subsystems, setup/runtime verification surface, and ambiguity terms such as scaffold, application skeleton, local dev stack, baseline configuration, full stack, and project setup.
- Split broad scaffold/dev-stack/config/app-code children into multiple generated microtasks before persistence.
- Preserve original roadmap phase order and sequence ordering.
- Add dependency metadata so later microtasks depend on earlier prerequisite microtasks.
- Include `splitRationale` on generated microtasks so the operator sees why the broad child was split.
- For children that are already narrow, keep them intact but enrich their metadata from description text when possible.

Initial deterministic decomposition for `zai-mi.com`-like broad children:

- Repository/package bootstrap: package scripts and package manager metadata.
- TypeScript/build/test/lint configuration.
- Local development service or Docker/dev-stack configuration.
- Application entrypoint or skeleton source files.
- Smoke verification checks.

The split titles should remain implementation-sized and avoid creating a single task that spans setup, config, infrastructure, and app code.

## Prompt And Contract Updates

- Update generic roadmap generation instructions so broad strategic milestones remain allowed as roadmap text, but executable children extracted from roadmap text must be microtasks.
- Update extraction prompt instructions so JSON tasks include microtask-ready descriptions with Scope, Acceptance criteria, Verification, and Dependencies.
- Update `general` task intent decomposition wording to stop preserving broad implementable roadmap cards.

## Approval Gate

Approval should not create executable task rows from broad proposal children. Because proposal creation will normalize broad generated tasks first, approval normally receives only microtask children. Add an approval-time validation check as a fail-closed backstop so hand-crafted or stale proposals cannot bypass the contract.

If a proposal child still fails the microtask contract, approval must return a conflict/error and leave the proposal pending with no created task rows.

## Test Strategy

- Unit-test the roadmap service with a `zai-mi.com`-like generated broad child and assert `createRoadmapSplitProposal()` persists multiple microtasks with boundaries, acceptance checks, verification commands, dependencies, and rationale.
- Route-test the manual roadmap import path to prove a broad scaffold/dev-stack/config child returns `split_required` with multiple microtask children and approval creates only those children.
- Route-test approval fail-closed behavior for a manually persisted stale broad proposal.
- Keep existing audit roadmap tests green; audit-specific decomposition and validation remain owned by the audit workflow pack.

## Risk Controls

- Do not change task execution scheduling or child auto-start policy beyond rejecting broad children at approval.
- Do not require the web UI to understand every structured field for correctness; API payloads carry the fields, and existing row rendering can remain compatible.
- Keep deterministic decomposition conservative and targeted to the broad setup/scaffold case named by the task, rather than attempting to solve all possible planning decomposition.
