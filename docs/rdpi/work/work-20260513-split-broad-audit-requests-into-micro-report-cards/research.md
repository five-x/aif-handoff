# Research: Split Broad Audit Requests Into Micro Report Cards

## Task framing and lane

- Task ID: `work-20260513-split-broad-audit-requests-into-micro-report-cards`
- Lane: `work`
- Intake card: `docs/intake/work/work-20260513-split-broad-audit-requests-into-micro-report-cards.md`
- RDPI needed: `yes`
- Request: add an audit decomposition path that detects overly broad audit requests before execution, emits smaller source-report audit cards with clear scope/evidence/acceptance criteria, gates parent synthesis on child report completion, lets child cards retry independently, and preserves single-card behavior for narrow audits.

## Accepted planning sources or local facts

- `.agents/skills/runtask/SKILL.md` requires RDPI, preflight, independent gates, memory sync, and status update only after successful close-out.
- `.agents/skills/rdpi/SKILL.md` requires local repo facts first, planning-only artifacts before `PLAN PASS`, no runtime-visible evidence collection before the plan gate, and independent plan/test/review gates.
- `python "$env:USERPROFILE\.codex\tools\codex-ensure-rdpi.py"` returned `STATUS: ready`.
- `python "$env:USERPROFILE\.codex\tools\codex-flow-audit.py" --repo .` returned `STATUS: clean`.
- The selected intake card is an implementation task, not an audit-only diagnostic task.
- `packages/api/src/services/roadmapGeneration.ts` already owns typed audit roadmap generation, audit roadmap import, deterministic fallback source scopes, exactly-one-synthesis validation, and audit batch contract creation.
- `packages/shared/src/auditRoadmapContract.ts` already owns generated audit-card validation for diagnostic markers, concrete source scope, risk hypotheses, report-only allowed changes, synthesis scope, and implementation-shaped audit text.
- `packages/data/src/index.ts` already owns `roadmap_batches`, `roadmap_batch_artifacts`, attempt history, synthesis readiness, and `listRoadmapReportArtifactsForSynthesis()`.
- `packages/agent/src/coordinator.ts` already holds synthesis tasks while source artifacts are not ready and updates audit artifact states after completion evidence checks.
- `packages/shared/src/auditSynthesisClassifier.ts` and `packages/shared/src/auditReportValidator.ts` already classify source reports and final synthesis text.
- `packages/api/src/routes/tasks.ts` preserves direct single-card audit task creation today through the normal `/tasks` path. This is the narrow-audit behavior to preserve in this task.
- Direct `/tasks` audit creation is also a broad-audit entry point today. A broad direct audit request must not become one runnable audit card after this task; it must be classified and rejected with decomposition guidance or routed to the roadmap decomposition path before execution.
- `docs/intake/work/work-20260513-design-hierarchical-task-model.md` is a separate queued design task for generic parent/child schema. This task should not preempt that broad hierarchy design.
- `docs/intake/work/work-20260513-reject-weak-audit-plans-in-plan-checker.md` is a separate queued task for stricter audit plan-review rejection. This task can make decomposition explicit but should not implement the full weak-plan checker.
- Explorer subagent `019e219b-3963-7043-92e3-c72a78f7662b` independently identified the same likely surface: roadmap generation/import, shared audit contract, data batch/artifact lifecycle, coordinator synthesis gating, and synthesis/report classifiers.
- Independent plan review returned `PLAN FAIL` on the first pass because the initial design wired broad classification only into audit roadmap generation and left broad direct `/tasks` audit creation able to create one broad runnable card. The revised design must close that entry point.

## Same-project memory

- `docs/kb/audit-evidence-provenance-contract.md` defines the local target model: audit plans declare scope roots and risk hypotheses, source reports bind evidence to those requirements, and batch synthesis must not claim a stronger conclusion than the source report classifications support.
- `docs/memory/tasks/work/work-20260512-audit-artifact-lifecycle-hypotheses.md` records a relevant local hypothesis: retryable invalid/inconclusive attempts should not release synthesis readiness, but explicitly terminal source states need durable attempt boundaries and must remain distinguishable from trusted valid reports.
- `docs/memory/tasks/work/work-20260513-terminalize-stalled-audit-rework-loops-delta.md` contains no reusable facts, decisions, or patterns, but its RDPI result confirms recent local code added stalled-loop terminalization and no-substantive-delta guards for audit report rework.
- `docs/memory/tasks/work/work-20260513-audit-roadmap-explicit-scope-risk-contract-delta.md` contains no reusable facts, decisions, or patterns. The RDPI result and code are accepted instead as local source facts.

## Cross-project reusable patterns

- No cross-project memory was used. The task is tightly bound to this repo's typed audit workflow and roadmap batch lifecycle.

## Rejected or stale memory candidates

- A generic task hierarchy is rejected for this task because the queued `work-20260513-design-hierarchical-task-model` card owns that design. The smaller viable model is to reuse roadmap batches and artifacts as parent/child tracking for audit decomposition.
- Model-only broadness classification is rejected as the primary gate because it would be hard to test deterministically. The classifier should be deterministic and prompt wording may only reinforce it.
- Treating retryable invalid, missing, weak, or inventory-only reports as synthesis-ready is rejected because it would let parent synthesis close from weak child outputs.

## Open questions

- How broad should the deterministic classifier be without blocking valid narrow manual audit cards? The planned answer is conservative: classify broad only on explicit repository/project-wide wording or multiple unrelated audit domains, and leave concrete scoped report cards alone.
- Which inconclusive child states should release synthesis? The planned answer is only explicit terminal states, not retryable invalid or missing states.

## Hypotheses

- H1: A shared deterministic `classifyAuditDecompositionRequest()` helper can identify broad audit requests across roadmap generation and direct task creation without changing the generic task schema.
- H2: The current audit roadmap batch is already the right parent/child tracking model for this task; source report cards are child artifacts and the synthesis card is the parent close-out surface.
- H3: Updating synthesis readiness to include explicitly terminal source outcomes lets final synthesis explain passed/inconclusive child reports without trusting weak or missing reports.
- H4: Adding child-report status requirements to generated synthesis card text will make final parent synthesis auditable without adding schema churn.
- H5: Existing single-card `/tasks` audit creation can remain unchanged and serve as the narrow audit path.

## Proposed verification and evidence plan

- Add shared unit tests for deterministic broad/narrow audit decomposition classification.
- Add API roadmap-generation tests proving broad audit requests are classified before generation/import and produce scoped source report cards plus synthesis requirements.
- Add API/task route tests proving narrow direct audit task creation remains a single task and broad direct audit task creation is rejected before a runnable broad card is created.
- Add data tests proving synthesis remains blocked for missing/retryable weak children and releases only when all source reports are trusted valid or explicitly terminal inconclusive/manual exception.
- Add coordinator tests proving the synthesis task cannot run until children reach ready states, and that an independently retried child artifact can unblock the parent.
- Add synthesis/completion evidence tests proving final synthesis text must name source report status and cannot claim a forged stronger outcome.
