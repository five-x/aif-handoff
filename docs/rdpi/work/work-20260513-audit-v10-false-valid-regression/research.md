# Research - Audit V10 False Valid Regression

## Task framing and lane

- Task ID: `work-20260513-audit-v10-false-valid-regression`
- Lane: `work`
- Intake card: `docs/intake/work/work-20260513-audit-v10-false-valid-regression.md`
- RDPI path: `docs/rdpi/work/work-20260513-audit-v10-false-valid-regression`
- RDPI needed: yes

The task asks for an end-to-end regression canary for the audit-v10 false-valid class: source audit cards with `Scope: .`, deterministic repair, hidden `.agents/**` evidence, and final synthesis that must not become trusted `validated_no_findings`.

## Accepted planning sources or local facts

- `.agents/skills/runtask/SKILL.md` requires RDPI, `codex-ensure-rdpi.py`, `codex-flow-audit.py --repo .`, independent gates, `$memsync MODE=auto`, and updating only the selected intake status after successful close-out.
- `.agents/skills/rdpi/SKILL.md` requires research, design, plan, independent `PLAN PASS`, implementation, independent `TEST PASS`, independent `REVIEW PASS`, and no live/runtime evidence collection before `PLAN PASS`.
- Preflight results:
  - `python "$env:USERPROFILE\.codex\tools\codex-ensure-rdpi.py"` reported `STATUS: ready`.
  - `python "$env:USERPROFILE\.codex\tools\codex-flow-audit.py" --repo .` reported `STATUS: clean`.
- The worktree already contains unrelated modified and untracked intake, RDPI, memory, and code files. This task must preserve unrelated user/prior-task changes and touch only files needed for this canary and RDPI close-out.
- `packages/agent/src/subagents/implementer.ts` contains deterministic audit report repair. Relevant planning surfaces:
  - `shouldUseDeterministicAuditReportRepair()` detects repeated validator failures and audit evidence repair signals.
  - `parseAuditScopeRoots()` rejects `Scope: .` as no concrete scope.
  - `AUDIT_REPAIR_IGNORED_DIRS` includes hidden tooling roots such as `.agents`, `.ai-factory`, `.claude`, `.codex`, and `.github`.
  - `collectAuditRepairEvidenceFiles()` skips hidden tooling files unless the hidden root is explicitly scoped.
  - `buildDeterministicAuditReportRepairContent()` returns `source_inconclusive` when concrete scope, scoped evidence, or risk-specific evidence is unavailable.
  - `runDeterministicAuditReportRepair()` persists `source_inconclusive` artifact state with failure family and validation details.
- `packages/agent/src/__tests__/implementer.test.ts` already has nearby deterministic repair fixtures:
  - hidden tooling broad repair returns `source_inconclusive`;
  - explicit product scope with generic evidence remains `source_inconclusive`;
  - risk-specific scoped evidence remains a positive trusted repair.
- `packages/data/src/index.ts` counts report artifacts as trusted only when state is `valid` and source classification is trusted. Trusted `validated_no_findings` also requires a valid manifest status.
- `packages/data/src/index.ts` currently allows some terminal non-trusted source artifact states to release synthesis execution so the synthesis artifact can become terminal inconclusive. This conflicts with the selected intake card, which explicitly requires batch readiness to remain false when all source reports are irrelevant, insufficient, or source-inconclusive.
- `packages/shared/src/auditSynthesisClassifier.ts` classifies source reports. It returns `validated_no_findings` only when every included source report has substantive no-findings evidence and no weak report count is present; weak reports force `inconclusive_batch_evidence`.
- `packages/shared/src/__tests__/taskCompletionEvidence.test.ts` already blocks forged synthesis metadata with zero or inventory-only source counts, and blocks persisted inconclusive synthesis even when final prose looks stronger.
- `packages/shared/src/auditReportValidator.ts` rejects hidden/generated evidence paths unless directly scoped and rejects explicit `Scope: .` as missing scope coverage.

Read-only explorer summary:

- Best canary insertion point is `packages/agent/src/__tests__/implementer.test.ts` near existing deterministic audit repair tests because it already has git fixtures, batch contract helpers, manifest readers, and artifact assertions.
- A single canary should model a batch with multiple source cards plus synthesis, not only a single source repair.
- The main risk is the lifecycle interpretation of "batch readiness remains false" versus the existing terminal-inconclusive synthesis flow.

## Same-project memory

Local curated memory artifacts were consulted after local source and RDPI facts:

- `docs/memory/tasks/work/work-20260513-audit-evidence-relevance-gate-delta.md`
  - Trusted no-findings requires concrete scoped risk or absence claims.
  - Hidden, generated, and report artifact paths do not count as product evidence unless directly scoped.
  - `Scope: .` is rejected as missing scope coverage.
- `docs/memory/tasks/work/work-20260513-deterministic-audit-repair-source-inconclusive-delta.md`
  - Contains no promoted facts, decisions, or patterns.
- `docs/memory/projects/aif-handoff/capsule.md`
  - Current capsule is sparse and should not override current source or the task card.

Shared-memory MCP recall was not used before `PLAN PASS` because this repo-specific RDPI task has enough local context and the planning boundary forbids shared-memory recall before plan review unless explicitly waived.

## Cross-project reusable patterns

No cross-project reusable memory was used. The task is tightly bound to local audit artifact lifecycle code and existing local fixtures.

## Rejected or stale memory candidates

- Existing local memory artifacts under `docs/memory/**` were treated as reviewable context only, not as authoritative over current source, current tests, or the selected intake card.
- Prior RDPI results were used only to identify established local behavior and nearby insertion points; they do not override this task's done criteria.

## Plan review feedback

The first independent plan review returned `PLAN FAIL`.

- Blocking issue: the first plan weakened the acceptance criterion by treating `synthesisReady === true` as acceptable when it only enabled terminal inconclusive synthesis.
- Required correction: assert the concrete batch readiness predicate stays false for all-nontrusted source reports, for example `summarizeRoadmapBatch(batchId).synthesisReady === false`, and plan a production change if the current data lifecycle disagrees.
- Required correction: do not run final synthesis from an all-weak/source-inconclusive batch as part of the canary. The canary must fail if the synthesis task becomes runnable from weak source reports.

## Resolved interpretation

For this task, "batch readiness remains false" means the concrete data-layer readiness field and queue predicate must remain false:

- `summarizeRoadmapBatch(batchId).synthesisReady === false`
- persisted batch `synthesisReady` remains false after refresh/update
- the synthesis task remains paused or blocked with `synthesis_not_ready`
- `claimBacklogTaskForAdvance(synthesisTaskId)` must not claim the synthesis task when every source report is weak, insufficient, irrelevant, or `source_inconclusive`

This task intentionally narrows readiness to trusted source reports for synthesis release. Terminal inconclusive source artifacts may remain terminal non-trusted records, but they must not release a synthesis task or create a successful no-findings path.
