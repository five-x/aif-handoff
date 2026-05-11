# Design - Audit Batch Integration Canary

## Goal

Add deterministic integration coverage for the typed audit batch lifecycle. The tests should fail if the platform regresses to the observed audit-v7 failure class: a weak first audit report is accepted, manual `request_changes` is skipped by stale evidence, synthesis starts too early or consumes weak findings, or local runtime token usage is treated like paid external spend.

## Non-goals

- Do not run or depend on a live Qwen model.
- Do not assert on paths from the external canary project.
- Do not broaden production behavior unless the canary exposes an actual gap.
- Do not create follow-up task cards in this implementation run.

## Test design

### Lifecycle canary

Add a deterministic coordinator-level canary in `packages/agent/src/__tests__/coordinator.test.ts`.

The scenario should use a temp git fixture with generic files such as `src/index.ts`, `src/worker.ts`, `README.md`, and an expected report path under `audit/`. It should create:

- one typed audit report task with a roadmap batch report artifact;
- one typed audit synthesis task with a batch synthesis artifact;
- a batch contract linking both tasks.

The canary should then prove these transitions:

1. While the source report artifact is still `expected`, synthesis is held with `synthesis_not_ready`.
2. A weak report containing synthetic git output, mixed findings/no-findings, and doc-only weak findings fails completion/review validation, moves the report artifact to `invalid`, and requests/records rework rather than marking it valid.
3. Manual `request_changes` on a previously valid report artifact moves it back to `expected`, records a `reworkBoundary`, and coordinator processing calls the implementer instead of logging the stale "skipping implementer" shortcut.
4. A valid report artifact with scoped source evidence is promoted to `valid`.
5. Once all source artifacts are terminal, synthesis can proceed, but synthesis input assembly must include only validated report content as findings and weak/invalid artifacts only as weak artifact metadata.

If one test becomes too large or requires crossing incompatible mocks, split the proof between:

- coordinator lifecycle assertions in `coordinator.test.ts`;
- synthesis prompt-input assertions in `implementer.test.ts`.

### Usage semantics canary

Add focused runtime registry coverage in `packages/runtime/src/__tests__/registry.test.ts`:

- A local-style partial usage adapter can return token usage with no `costUsd`; the usage sink records the event and leaves cost undefined/null rather than blocking.
- An external/full usage adapter returns token and cost usage; the usage sink records both, preserving cost accounting.
- Existing budget/limit behavior remains covered by current runtime and agent tests; this canary should assert accounting semantics without introducing live provider calls.

## Acceptance mapping

- Weak report -> invalid/rework-needed: coordinator canary uses the observed bad report traits and asserts artifact/task rework state.
- Manual `request_changes`: API or coordinator fixture asserts artifact state returns to `expected` with actionable rework details and implementer is invoked on the next coordinator cycle.
- Valid report artifact: coordinator/shared completion path marks the report artifact `valid`.
- Synthesis readiness/input: coordinator holds when sources are not terminal; implementer prompt includes only valid report contents as findings.
- Observed bad report class: fixture includes synthetic git output, mixed findings/no-findings, doc-only weak findings, and skipped-rework regression.
- Local-vs-external usage: runtime registry test records local partial tokens without cost and external full tokens with cost.

## Expected write set

- `packages/agent/src/__tests__/coordinator.test.ts`
- `packages/agent/src/__tests__/implementer.test.ts` if prompt-input proof needs a focused synthesis test
- `packages/runtime/src/__tests__/registry.test.ts`
- RDPI artifacts under `docs/rdpi/work/work-20260511-audit-batch-integration-canary/`

## Verification plan

- `npm.cmd test --workspace=@aif/agent -- src/__tests__/coordinator.test.ts src/__tests__/implementer.test.ts`
- `npm.cmd test --workspace=@aif/runtime -- src/__tests__/registry.test.ts`
- If shared validator behavior is touched: `npm.cmd test --workspace=@aif/shared -- src/__tests__/auditReportValidator.test.ts src/__tests__/taskCompletionEvidence.test.ts`
- `npm.cmd run build --workspace=@aif/agent`
- `npm.cmd run build --workspace=@aif/runtime`
- `git diff --check`
