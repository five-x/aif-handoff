<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

# Research

## Task framing and lane

- Task: work-20260515-enforce-exact-rework-closure
- Lane: work
- Scope: enforce exact blocking-finding closure before any successful completion label.
- RDPI boundary: implementation starts only after independent `PLAN PASS`.

## Accepted planning sources

- Task card: `docs/intake/work/work-20260515-enforce-exact-rework-closure.md`
- Governing local instructions: `AGENTS.md`
- Current implementation:
  - `packages/agent/src/reviewContract.ts`
  - `packages/agent/src/reviewGate.ts`
  - `packages/agent/src/autoReviewHandler.ts`
  - `packages/agent/src/coordinator.ts`
  - `packages/agent/src/subagents/implementer.ts`
  - `packages/agent/src/subagents/reviewer.ts`
  - `packages/shared/src/types.ts`
- Existing coverage:
  - `packages/agent/src/__tests__/reviewContract.test.ts`
  - `packages/agent/src/__tests__/reviewGate.test.ts`
  - `packages/agent/src/__tests__/coordinator.test.ts`
- Public contract docs:
  - `docs/architecture.md`
  - `docs/configuration.md`
  - `docs/api.md`

## Local repo facts

- `codex-ensure-rdpi.py` reported `STATUS: ready`.
- `codex-flow-audit.py --repo .` reported `STATUS: clean`.
- Review comments already have a structured contract with `Blocking Findings`, `Advisories`, and `Previous Findings` sections.
- Finding IDs are deterministic for review text via `createAutoReviewFindingId`.
- `evaluateReviewCommentsForAutoMode` persists previous finding metadata and can classify `resolved` vs `still_blocking` in structured review output.
- `handleAutoReviewGate` can return `accepted`, `rework_requested`, or `manual_review_required`.
- The coordinator already blocks non-roadmap stalled same-finding loops as `blocked_external`.
- The coordinator still terminalizes roadmap source reports through `terminalizeRoadmapSourceReportAsInconclusive`, which currently sets task status to `done` after `stalled_rework_loop` or `no_substantive_rework_delta`.
- The coordinator still moves non-stalled `manual_review_required` outcomes to `done` with `manualReviewRequired=true`.
- Existing tests assert the old behavior for roadmap stalled/no-delta report terminalization as `done`; these expectations must be changed.
- Implementer prompts already expose `REWORK_BLOCKED_REASON`, `FULL_REVIEW_COMMENTS`, and a `BLOCKING_FINDINGS_SNAPSHOT`.
- The implementer rework protocol already asks for addressed/unresolved finding IDs in final text, but it does not make a deterministic finding-closure self-check mandatory for every rework before review handoff.
- Reviewer prompts already receive previous finding IDs and require `resolved` or `still_blocking`, but the output contract can be tightened to require concrete closure evidence before `resolved`.
- Audit/report-specific guards already validate manifests, evidence refs, scope coverage, and substantive evidence through `evaluateTaskCompletionEvidence` and `validateAuditReportArtifact`.

## Same-project memory

- Not queried before `PLAN PASS` per the local RDPI boundary.

## Open questions resolved by local facts

- Status model does not include a separate `manual_review_required` status. Use existing `blocked_external` with `manualReviewRequired=true`, preserved `autoReviewState`, and explicit `blockedReason`.
- Audit source reports can remain artifact-state `source_inconclusive`, but the task status must not be `done` when the artifact is not trusted synthesis input.

## Hypotheses

- Converting manual-review and terminal-inconclusive unresolved paths from `done` to `blocked_external` will make `done` represent only accepted review/completion evidence paths.
- Tightening implementer/reviewer prompt contracts will reduce weak rework attempts without changing validators.
- Targeted coordinator/review gate tests can cover the task card's required cases without broad fixture churn.
