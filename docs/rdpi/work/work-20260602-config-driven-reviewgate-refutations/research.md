# Research - work-20260602-config-driven-reviewgate-refutations

## Task framing and lane

- Task ID: `work-20260602-config-driven-reviewgate-refutations`.
- Lane: `work`.
- Source task: `C:/Users/apron/Desktop/aif_stabilization_tz_pack/10_reviewgate_config_refutations.md`.
- Existing intake: `docs/intake/work/work-20260602-config-driven-reviewgate-refutations.md`.
- Goal: move project-specific ReviewGate refutations out of generic ReviewGate code and into config-driven generic providers.
- Scope is implementation work, not an audit-only task. The work must preserve the current LoanOffer duplicate false-positive behavior through configuration and tests.

## Accepted planning sources or local facts

- `AGENTS.md` identifies this as a Node/TypeScript repo and lists `npm.cmd run build`, `npm.cmd test`, and `npm.cmd run lint` as canonical commands.
- RDPI preflight command was run before artifact writes. It returned `STATUS: refreshed`, so `AGENTS.md` was reread after refresh.
- `docs/intake/work/work-20260602-config-driven-reviewgate-refutations.md` says the generic ReviewGate must not contain hardcoded project/business example terms such as prior LoanOffer-specific exceptions.
- `packages/agent/src/reviewGate.ts` currently contains `isRefutedLoanOfferDuplicateFinding` with hardcoded `LoanOffer`, `src/data/offers.ts`, and `src/types/domain.ts` logic.
- `packages/agent/src/reviewGate.ts` also contains a generic JSON syntax refutation. This is file-backed and not project-specific.
- `packages/agent/src/reviewGate.ts` applies repository refutations through `filterRefutedRepositoryFindings`, which feeds `filterActionableBlockingFindings`.
- `packages/shared/src/projectConfig.ts` currently exposes `paths`, `workflow`, `git`, and `language` only. There is no `reviewGateRefutations` config section.
- `packages/shared/src/reviewGateRefutations.ts` and `packages/shared/src/__tests__/reviewGateRefutations.test.ts` do not exist.
- `packages/agent/src/__tests__/reviewGate.test.ts` contains LoanOffer behavior tests: one refutes duplicate blockers when `offers.ts` imports the domain type, and one keeps the blocker when `offers.ts` declares a local type.
- `packages/shared/src/__tests__/projectConfig.test.ts` is the local pattern for config parser/default tests.
- Current working tree had unrelated modified docs/memory files before this task. Those should not be reverted.

## Same-project memory

- Not queried before `PLAN PASS`. The RDPI boundary prohibits shared-memory recall before plan approval unless explicitly waived, and local repo facts were sufficient for planning.

## Cross-project reusable patterns

- Not queried before `PLAN PASS` for the same reason.

## Rejected or stale memory candidates

- None evaluated.

## Research delegation

- Explorer subagent `019e9622-4140-7fb1-a0b3-687958b947fd` independently confirmed the hardcoded LoanOffer refutation, the missing config/provider module, the current tests, and the likely touchpoints.
