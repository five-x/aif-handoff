<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

---

memory_id: task::aif-handoff::work::work-20260508-harden-planner-replan-loop::delta
project_id: project::aif-handoff
repo_name: aif-handoff
lane: work
task_id: work-20260508-harden-planner-replan-loop
source_path: docs/rdpi/work/work-20260508-harden-planner-replan-loop
stability: validated
sensitivity: local-only
kind: artifact
project: aif-handoff
entity: aif-handoff
scope: task
updated_at: 2026-05-08
supersedes:
expires_at:
tags:

- aif-handoff
- work
- task-delta
- planner-quality
- runtime-prompt-policy
  source_refs:
- docs/rdpi/work/work-20260508-harden-planner-replan-loop/research.md
- docs/rdpi/work/work-20260508-harden-planner-replan-loop/design.md
- docs/rdpi/work/work-20260508-harden-planner-replan-loop/plan.md
- docs/rdpi/work/work-20260508-harden-planner-replan-loop/result.md
  created_at: 2026-05-08
  last_verified_at: 2026-05-08

---

# Summary

Curated delta for task work-20260508-harden-planner-replan-loop.

# Why It Matters

The planner/replan loop now has deterministic protection against weak model-generated plans reaching implementation, especially for runtimes that can echo skill commands or hidden-thinking artifacts.

# When To Reuse

Reuse when diagnosing or extending AIF planning, plan checking, runtime prompt policy, or coordinator replan behavior.

# When Not To Reuse

Do not treat task-local implementation details as cross-project guidance unless promoted into a reviewed pattern or decision.

## Facts

- `packages/shared/src/planQuality.ts` owns deterministic plan-quality evaluation and the typed `TaskPlanQualityError`.
- `packages/agent/src/subagents/planChecker.ts` enforces plan quality before accepting existing plans, local conversions, local fallback conversions, or LLM-normalized plans.
- `packages/agent/src/coordinator.ts` catches `TaskPlanQualityError` from the plan-checker stage, requeues planning with feedback for two retries, then blocks externally.
- `packages/agent/src/subagents/planner.ts` includes prior plan-quality feedback and narrowed diagnostic-only planning constraints in planner context.
- `packages/runtime/src/promptPolicy.ts` appends no-think/final-answer guidance to planner and plan-checker workflows and only prepends `/aif-plan` fallback when the runtime advertises `supportsAifSkillCommands`.

## Decisions

- Use a shared deterministic guard instead of relying on plan-checker LLM output alone.
- Treat slash-command echoes, thinking artifacts, and generic checklist items as fail-closed plan-quality issues before implementation.
- Keep diagnostic classification explicit: audit, discovery, inventory, gap-analysis, findings, security/code review, review findings, and validation/verification report/task/audit/findings contexts.
- Preserve plan-quality retry count across successful replanner runs so the retry limit cannot be reset by producing another invalid plan.
- Mark Claude SDK/CLI capabilities as supporting AIF skill commands, while default/API capabilities do not.

## Patterns

- Planning pipelines should pair prompt hardening with deterministic output validation.
- Typed stage errors let a coordinator distinguish recoverable replan feedback from generic runtime failure.
- Bounded replanning should preserve retry state across successful planner runs and eventually fail closed with an operator-facing reason.
