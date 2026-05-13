# Research: Reject Weak Audit Plans In Plan Checker

## Task framing and lane

- Task ID: `work-20260513-reject-weak-audit-plans-in-plan-checker`
- Lane: `work`
- Intake card: `docs/intake/work/work-20260513-reject-weak-audit-plans-in-plan-checker.md`
- RDPI needed: `yes`
- Request: harden the audit plan-review gate so weak, oversized, or under-specified audit plans fail before implementation begins.
- Done when audit plans declare scoped evidence targets, excluded areas, expected report structure, and whether child audit reports are required; broad unrelated audit plans without decomposition receive `PLAN FAIL`; feedback names missing facts or decomposition gaps; tests cover weak broad plans, acceptable narrow plans, and acceptable decomposed plans.

## Accepted planning sources or local facts

- `.agents/skills/runtask/SKILL.md` requires RDPI execution, preflight, flow audit, independent plan/test/review gates, memory sync, and status update only after successful close-out.
- `.agents/skills/rdpi/SKILL.md` requires local repo facts first, planning-only artifacts before `PLAN PASS`, no runtime-visible probing or shared-memory recall before the plan gate, and explicit explorer, reviewer, coder, tester, and final reviewer gates.
- `python "$env:USERPROFILE\.codex\tools\codex-ensure-rdpi.py"` returned `STATUS: ready`.
- `python "$env:USERPROFILE\.codex\tools\codex-flow-audit.py" --repo .` returned `STATUS: clean`.
- The selected task is an implementation task that edits the product's plan-quality gate; it is not an audit-only diagnostic task.
- The worktree is already dirty with related audit-decomposition and workflow-contract changes. This task must preserve unrelated existing changes and edit only the selected task's files.
- `packages/shared/src/planQuality.ts` owns deterministic plan-quality evaluation and `TaskPlanQualityError`. Current issue codes cover empty plans, missing checklist format, placeholder/generic plans, slash fallback echoes, thinking artifacts, missing task-specific paths, missing diagnostic report constraints, diagnostic artifact mismatch, and diagnostic scope violations.
- `packages/agent/src/subagents/planChecker.ts` calls `evaluateTaskPlanQuality()` before accepting existing checklist plans, local bullet conversions, fallback conversions, or LLM-normalized plans. The coordinator already treats thrown `TaskPlanQualityError` as plan-review failure feedback.
- `packages/shared/src/__tests__/planQuality.test.ts` is the focused shared regression suite for plan-quality behavior.
- `packages/agent/src/__tests__/planChecker.test.ts` is the focused agent-level suite proving the plan-checker rejects invalid plans before implementation.
- `packages/shared/src/auditRoadmapContract.ts` already has `classifyAuditDecompositionRequest()`, which returns `single_report` or `decomposed_report_batch`, `requiresDecomposition`, and stable reason codes for broad or unbounded audit requests.
- The current diagnostic fallback plan in `buildDeterministicDiagnosticPlan()` creates a checklist with a report artifact, diagnostic-only constraint, evidence citation, report fields, and path verification. It does not require exclusions or a child-report/decomposition decision.
- Current plan-quality validation does not require audit plans to declare scoped evidence targets, explicit exclusions, expected report structure, or child-audit-report requirements.

## Same-project memory

- `docs/memory/tasks/work/work-20260508-harden-planner-replan-loop-delta.md` is accepted local curated memory. It records that deterministic plan-quality validation belongs in `packages/shared/src/planQuality.ts`, is enforced by `packages/agent/src/subagents/planChecker.ts`, and should fail closed before implementation instead of relying on LLM output alone.
- `docs/memory/tasks/work/work-20260513-split-broad-audit-requests-into-micro-report-cards-delta.md` is accepted local curated memory. It records the local decision candidate that broad audit requests should be routed through deterministic decomposition and should emit source report cards plus a synthesis card rather than a single broad audit card.
- `docs/kb/audit-evidence-provenance-contract.md` is accepted project KB. It defines the target audit-plan contract: authorized source boundaries, declared scope roots, explicit exclusions, risk hypotheses, required reports/synthesis artifacts, allowed evidence classes, minimum evidence expectations, and change boundaries.

## Cross-project reusable patterns

- No cross-project memory was used. The change is tightly coupled to this repository's audit plan-quality and audit decomposition contracts.

## Rejected or stale memory candidates

- Shared-memory MCP recall was not used before `PLAN PASS` because repo RDPI instructions forbid shared-memory recall during pre-plan work unless explicitly waived.
- A generic task hierarchy model is rejected for this task because `docs/intake/work/work-20260513-design-hierarchical-task-model.md` owns that broader design.
- Replacing the plan-checker with a new LLM reviewer is rejected. The existing deterministic plan-quality path already feeds typed failure reasons back into replanning and is the narrower, testable surface.
- Making all workflow plans satisfy audit-only markers is rejected. New checks must apply only to audit or inferred diagnostic audit tasks.

## Explorer findings

- Independent explorer `019e2203-fd01-7ae3-87eb-bf1494b604b7` confirmed the likely change surfaces: `packages/shared/src/planQuality.ts`, `packages/shared/src/__tests__/planQuality.test.ts`, `packages/agent/src/subagents/planChecker.ts`, and `packages/agent/src/__tests__/planChecker.test.ts`.
- The explorer identified the main behavior gap: the current evaluator partially checks diagnostic report constraints but does not require scoped evidence targets, excluded areas, expected report structure, or child-report/decomposition decisions.
- The explorer flagged the fallback risk: invalid diagnostic audit plans can be replaced with a deterministic fallback before failing. The fallback must not silently accept broad or under-specified plans without the new audit plan contract.

## Open questions

- How strict should "excluded areas" be? Planned answer: require a clear explicit exclusion marker, with `none`/`no exclusions` acceptable for a narrow audit only when the plan also names scoped evidence targets.
- How should child audit reports be declared? Planned answer: require a deterministic marker that says either no child reports are needed for a narrow source audit, or child/source reports plus a synthesis report are required for decomposed audits.
- How should expected report structure be recognized? Planned answer: require the plan text to name the report fields already used by the audit contract: finding ID, severity or confidence, evidence, risk, proposed fix, and verification.

## Hypotheses

- H1: Adding audit-specific issue codes to `evaluateTaskPlanQuality()` can fail weak audit plans before implementation without affecting non-audit workflow plans.
- H2: Reusing `classifyAuditDecompositionRequest()` lets the plan checker reject broad audit plans without inventing a second broadness heuristic.
- H3: A narrow audit plan can pass when it has one concrete report artifact, scoped evidence targets, explicit exclusions, expected report structure, and a clear "no child reports required" decision.
- H4: A decomposed audit plan can pass when it declares child/source report artifacts, synthesis output, scoped evidence targets for the child reports, explicit exclusions, and expected report structure.
- H5: Updating deterministic diagnostic fallback output to include exclusions and child-report decisions will keep recovery for malformed narrow diagnostic plans while still failing broad plans that require decomposition.

## Proposed verification and evidence plan

- Add shared unit tests in `packages/shared/src/__tests__/planQuality.test.ts` for:
  - a weak broad audit plan that lacks scoped evidence targets, exclusions, report structure, and child-report decisions;
  - an oversized audit plan that covers unrelated domains without decomposition;
  - an acceptable narrow audit plan with explicit scope, exclusions, report structure, and no-child decision;
  - an acceptable decomposed audit plan with child source reports and synthesis decision;
  - non-audit implementation plans remaining unaffected.
- Add agent-level plan-checker tests in `packages/agent/src/__tests__/planChecker.test.ts` proving broad or weak audit plans throw `TaskPlanQualityError` before invoking implementation, while a malformed narrow diagnostic plan can still receive a valid deterministic fallback.
- Run focused verification after `PLAN PASS`:
  - `npm.cmd test --workspace @aif/shared -- planQuality`
  - `npm.cmd test --workspace @aif/agent -- planChecker`
  - broader `npm.cmd test --workspace @aif/shared -- auditRoadmapContract planQuality` if the broad classifier integration changes behavior.
