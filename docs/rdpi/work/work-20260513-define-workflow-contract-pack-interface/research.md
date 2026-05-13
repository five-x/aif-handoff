# Research - Define Workflow Contract Pack Interface

## Task Framing And Lane

- Task ID: `work-20260513-define-workflow-contract-pack-interface`.
- Lane: `work`.
- RDPI needed: yes.
- Requested scope: define a core-vs-pack architecture for workflow reliability in AIF Handoff.
- Explicit boundary: this is a planning task only. It must not rewrite audit validators, add schema, or implement finance/analytics support.
- Product guardrail: preserve AIF Handoff as an autonomous task handoff platform. Audit is the first hard reliability pack, not the whole product.

## Accepted Planning Sources Or Local Facts

### Independent local exploration

- A read-only `explorer` subagent inspected local files only and performed no edits, runtime probes, log reads, endpoint checks, or shared-memory recall.
- The explorer confirmed the main design pressure: task intents are generic, while current provenance, artifact lifecycle, runtime evidence naming, completion evidence, roadmap batch readiness, and deterministic review-gate blockers are audit-specific.
- Accepted explorer file references align with local reads in this artifact: `packages/shared/src/taskIntent.ts`, `packages/shared/src/schema.ts`, `packages/data/src/index.ts`, `packages/api/src/services/roadmapGeneration.ts`, `packages/agent/src/coordinator.ts`, `packages/agent/src/reviewGate.ts`, `packages/runtime/src/adapters/codex/auditEvidence.ts`, `packages/agent/src/hooks.ts`, and `docs/kb/audit-evidence-provenance-contract.md`.

### Product and pipeline model

- `package.json` describes AIF Handoff as an "Autonomous task management system with Kanban board and AI subagents".
- `docs/architecture.md` describes a task pipeline that moves through planning, implementation, review, rework, done, and verified states, with reviewer/security sidecars and an automatic post-review gate in auto mode.
- `packages/shared/src/types.ts` defines generic task state and handoff fields: `TaskStatus`, task plan/log/review/comment fields, roadmap alias, tags, review iteration state, branch/worktree fields, and task intent.
- `packages/agent/src/coordinator.ts` owns the generic stage pipeline: planner, plan-checker, implementer, and reviewer stages. It also owns automatic rework and terminal handoff behavior after review.
- `packages/runtime/src/workflowSpec.ts` already has a generic runtime workflow descriptor with `workflowKind`, prompt input, required capabilities, fallback strategy, session reuse policy, and metadata.

### Current generic workflow semantics

- `packages/shared/src/taskIntent.ts` defines first-class task intents: `general`, `audit`, `feature`, `fix`, `spike`, `docs`, and `tests`.
- Each task intent has a contract with decomposition guidance, defaults, executable backlog policy, allowed changes, evidence requirements, required gates, hard constraints, planning prompt, and implementation prompt.
- `feature` is already modeled as an implementation workflow with acceptance criteria and verification requirements, not as an audit-like report workflow.
- `fix`, `spike`, `docs`, and `tests` prove the product already wants workflow-specific semantics beyond audit.
- `packages/api/src/services/roadmapGeneration.ts` treats roadmap aliases as labels and makes `taskIntent` the authority for typed roadmap generation/import.

### Roadmap and task creation flow

- `packages/api/src/services/roadmapGeneration.ts` accepts explicit `taskIntent`, generates typed roadmap prompts, validates generated tasks, and imports tasks with intent-specific defaults.
- Generic roadmap imports remain `general`; typed imports preserve `taskIntent`.
- Audit import is special today: audit aliases are protected against reuse, audit tasks get `diagnostic-only` tags, synthesis tasks are paused, and roadmap batch artifact rows are created.
- `packages/data/src/index.ts` enforces audit and spike defaults during task creation/update. Audit always forces full planning, docs/tests planning, no skip-review, and subagents.

### Review and gate flow

- `packages/agent/src/reviewContract.ts` defines generic structured review output: previous findings, blocking findings, and advisories.
- `packages/agent/src/reviewGate.ts` turns structured or fallback review comments into accepted, request-changes, or manual-review-required outcomes.
- The review gate is generic in shape, but currently hard-codes audit/review/discovery evidence requirements through `isRiskyTask`, audit artifact lookup, audit report validation, and audit evidence ledger reads.
- `packages/agent/src/coordinator.ts` applies the review gate after the reviewer stage and can return tasks to implementation or mark manual review required.

### Memory flow

- `docs/rdpi/work/work-20260512-server-side-memory-loop/result.md` records the server-owned memory loop rollout.
- `packages/shared/src/types.ts` defines memory item, lifecycle, and usage concepts. Memory workflow kinds currently include `planner`, `implementer`, `reviewer`, `security_review`, and `chat`.
- `packages/shared/src/schema.ts` stores `memory_items`, `memory_usage_events`, and `memory_lifecycle_events` separately from shared-memory MCP state.
- `packages/data/src/index.ts` creates pending project-scoped memory candidates after verified task close-out and retrieves only approved, clean, unexpired project/global memory.
- `packages/agent/src/memoryContext.ts` injects approved memory as reference-only context and records usage events by workflow kind/source.
- `docs/api.md` and `docs/architecture.md` both state approved memory is reference-only and cannot override user, repo, or task instructions.

### Evidence and provenance flow

- `docs/kb/audit-evidence-provenance-contract.md` defines audit evidence and report trust boundaries: audit plan, source snapshot, evidence ledger, report manifest, source classifier, and batch classifier.
- `docs/rdpi/work/work-20260512-audit-evidence-ledger/result.md` records the append-only runtime audit evidence ledger rollout.
- `packages/shared/src/auditEvidenceLedger.ts` defines evidence runtime payloads/units with IDs, tool name, evidence kind/grade, scope IDs, risk hypothesis IDs, path hashes, command metadata, output hash/preview, redaction status, task ID, audit plan ID, and source snapshot ID.
- `packages/shared/src/schema.ts` persists `audit_evidence_events`.
- `packages/agent/src/hooks.ts` and `packages/agent/src/subagentQuery.ts` persist `audit:evidence` events into the data layer.
- `packages/runtime/src/adapters/codex/auditEvidence.ts` and Qwen/Codex runtime paths emit bounded evidence for file reads, searches, and shell commands.

### Audit-specific reliability flow

- `packages/shared/src/auditRoadmapContract.ts` defines audit artifact roles, artifact states, failure families, rework statuses, generated-card validation issue codes, required diagnostic markers, no-findings guardrails, synthesis outcome requirements, scope/risk parsing, report-only allowed changes, and implementation-shaped audit rejection.
- `packages/shared/src/auditReportValidator.ts` validates audit report manifests, manifest identity, source snapshot, content hash, outcome, ledger evidence refs, scope/risk coverage, line refs, and source classifications.
- `packages/shared/src/auditSynthesisClassifier.ts` classifies batch-level outcomes as `validated_findings_present`, `validated_no_findings`, or `inconclusive_batch_evidence`.
- `packages/shared/src/taskCompletionEvidence.ts` is a generic completion-evidence module by name, but much of the strict evidence behavior is tied to risky audit/review/discovery report artifacts.
- `packages/data/src/index.ts` persists audit roadmap batches, audit artifacts, artifact attempts, artifact state/failure details, and artifact attempt history.
- Recent RDPI results show a deliberate containment path: structured audit manifests, artifact lifecycle, evidence ledger, scope/risk contract, and false-valid regression canaries.

## Audit-Specific Rules That Have Leaked Into Generic Flow

- `taskCompletionEvidence.ts` treats audit/review/discovery/gap-analysis as "risky" through a broad text heuristic when explicit intent is absent.
- The generic completion gate knows about audit report artifacts, audit synthesis outcomes, report-only changes, audit manifests, audit ledger evidence, and audit-specific quality issue codes.
- `reviewGate.ts` has generic review-gate statuses, but deterministic findings are built from audit report validation and audit completion evidence.
- `coordinator.ts` has generic stage orchestration, but completion blocking, rework, terminal inconclusive, artifact state updates, and repeated failure signature handling are currently audit artifact specific.
- `roadmapGeneration.ts` has a generic typed roadmap mechanism, but audit generation/import has hard-coded prompts, deterministic fallback, alias reuse blocking, diagnostic-only validation, synthesis pausing, and roadmap batch artifact creation.
- `schema.ts` and `data/index.ts` store `roadmap_batches` and `roadmap_batch_artifacts`, but their columns are currently named and shaped around audit artifacts rather than a generic workflow artifact registry.
- Memory usage events record workflow kind, but memory candidates are generic task close-out summaries. There is no pack-specific memory brief contract yet.

## Core Concepts That Are Already Generic

- Task identity, status, lane-equivalent project/task grouping, priority, planning path, logs, review comments, tags, branch/worktree fields, and runtime profile fields.
- Task intent as the user-facing workflow type selector.
- Runtime workflow spec and runtime `workflowKind`.
- Review findings, advisories, previous-finding closure, review iterations, request-changes, and manual review handoff.
- Server-owned memory item lifecycle and reference-only prompt injection.
- Usage events keyed by workflow kind/source.
- Roadmap alias, task import ordering, generated task validation entry point, and tag enrichment.
- Evidence unit shape in principle: ID, actor/tool metadata, source/snapshot binding, scope/risk IDs, redacted preview/hash, and provenance references. The name is audit-specific, but the shape is mostly reusable.

## Minimum Architecture Problem

The system needs a boundary that lets core own handoff mechanics while packs own semantic rules. Without that boundary, each new workflow either:

- weakens audit by generalizing its strict rules too early;
- turns `feature` and future workflows into audit-like report flows;
- duplicates review/memory/evidence plumbing per workflow;
- or embeds more workflow-specific branches inside coordinator, roadmap import, and completion evidence.

## Same-Project Memory

Shared-memory recall was not used before `PLAN PASS` because the repo RDPI boundary forbids shared-memory recall before the plan gate unless explicitly waived.

Local same-project sources were used instead:

- `docs/rdpi/work/work-20260510-typed-task-intents/result.md`
- `docs/rdpi/work/work-20260512-server-side-memory-loop/result.md`
- `docs/rdpi/work/work-20260512-structured-audit-report-manifest/result.md`
- `docs/rdpi/work/work-20260512-audit-evidence-ledger/result.md`
- `docs/rdpi/work/work-20260512-audit-artifact-lifecycle/result.md`
- `docs/rdpi/work/work-20260513-audit-v10-false-valid-regression/result.md`
- `docs/kb/audit-evidence-provenance-contract.md`

## Cross-Project Reusable Patterns

None accepted before `PLAN PASS`. The local repo has enough current architecture and recent task history for this planning pass.

## Rejected Or Stale Memory Candidates

- Raw shared-memory recall: rejected for pre-plan boundary compliance.
- `docs/memory/tasks/...` local memory deltas: not treated as authoritative because `docs/rdpi` and `docs/kb` are the validated source-of-truth artifacts for this task.
- Finance/analytics workflow assumptions: rejected as implementation drivers. They are only future-fit checks until real requirements exist.
