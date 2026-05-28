# Research: Roadmap Audit Decomposition Ordered E2E

## Task framing and lane

- Task ID: `work-20260527-roadmap-audit-decomposition-ordered-e2e`.
- Lane: `work`.
- RDPI needed: yes.
- Target branch: `codex/roadmap-audit-oom-hardening`.
- Task source: `docs/intake/work/work-20260527-roadmap-audit-decomposition-ordered-e2e.md`.
- Request: broad audit requests must decompose into ordered scoped child audit cards plus a final synthesis card, with remote-only positive and negative e2e proof.

## Accepted planning sources or local facts

- Required preflight passed before RDPI execution:
  - `python "$env:USERPROFILE\.codex\tools\codex-ensure-rdpi.py"` returned `STATUS: ready`.
  - `python "$env:USERPROFILE\.codex\tools\codex-flow-audit.py" --repo .` returned `STATUS: clean`.
- Existing worktree had unrelated local modifications before implementation. The task explicitly excludes editing `docs/kb/windows-codex-bootstrap-validation.md`.
- `packages/shared/src/auditRoadmapContract.ts` already contains `classifyAuditDecompositionRequest()` and broad direct-audit classification.
- `packages/api/src/routes/tasks.ts` already rejects broad direct audit task creation/update with `AUDIT_DECOMPOSITION_REQUIRED` and creates direct one-report audit artifact contracts for narrow direct audits.
- `packages/api/src/services/roadmapGeneration.ts` already generates audit roadmaps with multiple report cards and one synthesis card, imports them deterministically by phase/sequence, creates an audit hierarchy parent, and persists roadmap batch artifact contracts.
- `packages/data/src/index.ts` already gates synthesis readiness on report artifacts that are trusted valid or accepted terminal inconclusive/manual-exception states, and parent rollup can close through the authoritative synthesis child.
- `packages/agent/src/subagents/planner.ts` and `packages/agent/src/subagents/planChecker.ts` already use persisted roadmap artifact context for deterministic audit report/synthesis plans.
- `packages/agent/src/subagents/implementer.ts` already routes audit report artifacts through the trusted artifact lifecycle and synthesis consumes typed trusted/blocking source artifact records, not raw report prose.
- UI/API already surface hierarchy and artifact trust projections, but child order/dependency state is mostly implicit through task ordering and artifact trust state.

## Explorer findings

The required RDPI explorer (`Helmholtz`) completed read-only research with no live probes, remote checks, logs, or memory recall.

Key findings:

- Broad direct audit rejection exists.
- Roadmap generation creates multiple audit cards plus one synthesis card, but child dependency/DAG metadata is not first-class beyond phase, sequence, task position, hierarchy parent, and paused synthesis.
- Import order is deterministic, but execution order is advisory through `position` unless project auto-queue is sequential.
- Synthesis gating exists over artifact readiness, not direct child task terminal status.
- Trusted synthesis is hardened against raw/untrusted source text.
- Operator surfaces show hierarchy and trust, but not explicit child dependency/order state.

## Same-project memory

Shared-memory recall was not used before `PLAN PASS` because the repo RDPI boundary forbids shared-memory recall before plan review unless explicitly waived. Local docs and prior RDPI artifacts were sufficient for planning.

Relevant local prior RDPI/docs used:

- `docs/rdpi/work/work-20260513-split-broad-audit-requests-into-micro-report-cards/result.md`: broad direct audit rejection and decomposed audit roadmap generation.
- `docs/rdpi/work/work-20260513-enforce-hierarchy-rollup-runtime-gates/*`: hierarchy parent/child rollup.
- `docs/rdpi/work/work-20260525-trusted-source-audit-synthesis/result.md`: trusted synthesis from typed source records only.
- `docs/rdpi/work/work-20260525-unblock-direct-audit-canary-planner-routing/result.md`: direct audit report contract, trusted lifecycle proof, and remote canary evidence.
- `docs/ops/audit-trust-callsite-map-20260525.md`: trusted audit artifact lifecycle call-site map.
- `docs/ops/external-audit-handoff-20260525.md`: remote audit handoff context.

## Cross-project reusable patterns

No cross-project memory or reusable pattern lookup was used before `PLAN PASS`.

## Rejected or stale memory candidates

- Raw shared-memory recall was intentionally skipped before `PLAN PASS`.
- Remote target health, task creation, scheduler state, logs, and worktree status were intentionally not probed before `PLAN PASS`.

## Planning hypotheses

- H1: The safest implementation path is to preserve the already-proven narrow direct audit path and harden only the roadmap/decomposition batch path.
- H2: Strict ordered execution can be enforced without a schema migration by deriving predecessor order from the persisted roadmap batch artifact rows joined to task `position`/`createdAt`, and by making backlog advancement fail closed when earlier report children are not terminal.
- H3: Deterministic card contracts should be made explicit in generated descriptions and validators: `Task intent: audit`, `Expected report artifact`, `Allowed write paths`, `Dependency order`, and `Trusted artifact lifecycle`.
- H4: Final synthesis can continue to rely on existing trusted artifact and terminal inconclusive gating, but tests should prove the synthesis child remains paused until required child reports are terminal/trusted enough.
- H5: Remote-only positive and negative e2e should run after local gates and before independent `TEST PASS`; the independent tester must review the recorded local and remote evidence before issuing `TEST PASS`.
