# Research: Deterministic Audit Synthesis Closeout

## Task framing and lane

- Task ID: `work-20260514-deterministic-audit-synthesis-closeout`
- Lane: `work`
- RDPI needed: `yes`
- Immutable intake card: `docs/intake/work/work-20260514-deterministic-audit-synthesis-closeout.md`
- Requested outcome: roadmap audit synthesis cards must deterministically leave plan/implementation dead ends and produce a final synthesis report from the roadmap batch artifact registry, preserving child source trust states and using `audit inconclusive` when trusted evidence is insufficient.

## Accepted planning sources or local facts

- Repository instructions in `AGENTS.md` require RDPI, independent gates, and local repo facts before memory recall.
- Required preflight passed before RDPI artifact edits:
  - `python "$env:USERPROFILE\.codex\tools\codex-ensure-rdpi.py"` returned `STATUS: ready`.
  - `python "$env:USERPROFILE\.codex\tools\codex-flow-audit.py" --repo .` returned `STATUS: clean`.
- The task card names these likely code paths:
  - `packages/shared/src/planQuality.ts`
  - `packages/agent/src/coordinator.ts`
  - roadmap batch artifact handling in `packages/data/src/index.ts`
- `packages/shared/src/planQuality.ts` already has a synthesis-only plan-quality exception that accepts source report artifacts as boundaries when the plan names existing child/source reports and exact report artifact paths. It does not itself know the roadmap batch artifact list.
- `packages/agent/src/subagents/planChecker.ts` already builds deterministic diagnostic fallback plans through `buildDeterministicDiagnosticPlan(...)`, but its plan-quality task context only supplies `auditArtifactRole` and `roadmapBatchId`, not the actual source report artifact paths.
- `packages/api/src/services/roadmapGeneration.ts` deterministic audit roadmap fallback still creates the synthesis item with wildcard scope `all audit/<date>-*-audit.md reports from this audit batch`, which is the failure shape called out in the task card.
- `packages/data/src/index.ts` treats trusted valid report artifacts as valid only when source classification is trusted. It treats `source_inconclusive`, `terminal_inconclusive`, and `manual_exception` as terminal for synthesis readiness, but terminal `invalid` and `missing` artifact states are not currently admitted into synthesis readiness in `roadmapSourceArtifactTerminalForSynthesis(...)`.
- `packages/data/src/index.ts` already imports `isTerminalAuditArtifactState` and `isTerminalAuditReworkStatus`, and `countActivePipelineTasksForProject(...)` uses latest attempt rework status to distinguish terminal manual artifact blocks from still-active pipeline work.
- `packages/data/src/index.ts` has `listRoadmapReportArtifactsForSynthesis(...)`, but the final filter currently drops `invalid` and `missing` artifacts even though those states are in the SQL state list.
- `packages/agent/src/subagents/implementer.ts` already has deterministic synthesis support:
  - reads validated source report content from worktree, branch, or project root;
  - lists weak artifacts without reading missing files;
  - writes child report status rows;
  - classifies inconclusive synthesis through `classifyAuditSynthesisSourceReports(...)`;
  - writes a manifest and audit evidence unit;
  - commits the synthesis artifact.
- `runImplementer(...)` currently invokes deterministic synthesis only when `expectedSynthesisArtifactPath && task.reworkRequested`. A first-run synthesis card with a recovered deterministic plan can still fall through to the runtime implementer instead of using the deterministic synthesis builder.
- Existing tests already cover several adjacent contracts:
  - `packages/shared/src/__tests__/planQuality.test.ts` covers marker-only audit-plan rejection and source-report child batch exception.
  - `packages/data/src/__tests__/planBRegression.test.ts` covers synthesis release for explicit terminal source states.
  - `packages/agent/src/__tests__/implementer.test.ts` covers deterministic synthesis rework, including source-inconclusive children.
  - `packages/agent/src/__tests__/planChecker.test.ts` covers deterministic diagnostic fallback for narrow audits.

## Same-project memory

- Shared-memory recall was not used before `PLAN PASS` because repository RDPI instructions explicitly prohibit shared-memory recall before plan review unless the user waives that boundary.
- Local `docs/ops/plan-b-v13-audit-runbook.md` is an accepted local doc source. It states parent synthesis should preserve child status differences, and terminal/inconclusive children must not be converted into validated no-findings.

## Cross-project reusable patterns

- Not queried before `PLAN PASS`.

## Rejected or stale memory candidates

- None evaluated before `PLAN PASS`.

## Risks and unknowns

- Widening synthesis readiness must not release truly external blockers. The safe boundary is terminal artifact state plus terminal latest attempt status, not raw `invalid` or `missing` while rework is still requested.
- Plan fallback needs exact source report paths, but `@aif/shared` should not import `@aif/data`; the data-aware assembly belongs in agent-side plan-checker context.
- Deterministic synthesis on first implementation must still respect `synthesis_not_ready` when the batch has no terminal source artifacts or trusted valid artifacts.
