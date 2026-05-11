# Research - Audit Batch Integration Canary

## Task framing and lane

- Task ID: `work-20260511-audit-batch-integration-canary`
- Lane: `work`
- Intake source: `docs/intake/work/work-20260511-audit-batch-integration-canary.md`
- Request: add deterministic or mocked integration coverage for the typed audit batch lifecycle so the platform catches the audit-v7 first-card failure class before live testing.
- Scope: platform tests for `aif-handoff`; no live Qwen dependency and no canary-project-specific path assertions.
- RDPI preflight: `python "$env:USERPROFILE\.codex\tools\codex-ensure-rdpi.py"` returned `STATUS: ready`.
- Flow audit: `python "$env:USERPROFILE\.codex\tools\codex-flow-audit.py" --repo .` returned `STATUS: clean`.

## Accepted planning sources or local facts

- `docs/rdpi/work/work-20260511-audit-quality-system-analysis/*` decomposed this work after identifying the combined failure class: weak report validation, stale manual rework, and synthesis consuming the wrong evidence.
- Earlier child tasks have already implemented the prerequisite contracts:
  - `docs/rdpi/work/work-20260511-audit-report-contract-validator/result.md` says the shared validator and observed bad report fixture are in place.
  - `docs/rdpi/work/work-20260511-audit-scope-coverage-contract/result.md` says scope coverage now rejects doc-only reports for scoped audit requests.
  - `docs/rdpi/work/work-20260511-audit-rework-freshness-contract/result.md` says manual `request_changes` on report artifacts invalidates stale valid state and prevents coordinator rework skips.
  - `docs/rdpi/work/work-20260511-audit-review-gate-validator-unification/result.md` says review gate acceptance now consumes deterministic validator/completion findings.
- `packages/shared/src/auditReportValidator.ts` owns typed audit report validation, including synthetic git output, contradictory findings/no-findings, missing scope coverage, and governance-only finding classes.
- `packages/shared/src/taskCompletionEvidence.ts` composes artifact validation, git delta, report-only delta, tool activity, and completion issue codes.
- `packages/api/src/services/taskEvents.ts` validates artifacts on `approve_done` and invalidates report artifacts on manual `request_changes`.
- `packages/agent/src/coordinator.ts` maps recoverable audit artifact failures into implementation rework, holds synthesis until batch readiness, and prevents report/synthesis rework skip based on stale evidence.
- `packages/data/src/index.ts` stores roadmap batch artifacts and computes `synthesisReady` only when non-synthesis artifacts are terminal.
- `packages/agent/src/subagents/implementer.ts` reads only `valid` report artifacts as synthesis findings and lists invalid/missing/external terminal artifacts as weak coverage inputs.
- Existing tests cover individual pieces:
  - `packages/shared/src/__tests__/auditReportValidator.test.ts` covers weak report content.
  - `packages/shared/src/__tests__/taskCompletionEvidence.test.ts` covers completion evidence guard behavior.
  - `packages/api/src/__tests__/tasks.test.ts` covers manual `request_changes` artifact invalidation.
  - `packages/agent/src/__tests__/coordinator.test.ts` covers separate coordinator hold/rework cases.
  - `packages/agent/src/__tests__/implementer.test.ts` covers synthesis prompt input assembly.
- Current gap: no deterministic canary test ties the typed audit batch lifecycle together across weak report validation, rework freshness, valid source promotion, synthesis readiness, validated-only synthesis inputs, and runtime usage semantics.
- Git status already contains many modified and untracked files from the prerequisite tasks; this run must work with those changes and avoid unrelated cleanup.

## Same-project memory

- Shared-memory recall was not used before `PLAN PASS` because this RDPI task is still planning and local repo facts plus prior local RDPI artifacts were sufficient.

## Cross-project reusable patterns

- None accepted. This is a local `aif-handoff` lifecycle regression test.

## Rejected or stale memory candidates

- No shared-memory candidates were queried.

## Implementation hypotheses

- The canary should be primarily additive test coverage, not production code, unless the new integration assertion exposes a real gap.
- `packages/agent/src/__tests__/coordinator.test.ts` is the best home for lifecycle state transitions because it already mocks subagents, uses the test DB, creates temp git repos, and imports roadmap batch helpers.
- `packages/agent/src/__tests__/implementer.test.ts` is the best home for asserting synthesis prompt input semantics if coordinator-level mocks cannot inspect prompt content.
- `packages/runtime/src/__tests__/registry.test.ts` is the best focused place to assert local partial usage can record tokens without cost and external/full usage records both tokens and cost.

## Risks and open questions

- Synthesis readiness intentionally treats invalid, missing, and external-blocked source artifacts as terminal, so the canary must distinguish "not ready while expected" from "ready once terminal but only valid reports become finding inputs."
- A single very large test can be brittle. Prefer one integration canary for lifecycle state plus one focused runtime registry test for usage semantics if that keeps failures legible.
- If existing tests already satisfy a done-when item individually, the new canary should make the cross-component contract explicit rather than duplicate every validator unit fixture.
