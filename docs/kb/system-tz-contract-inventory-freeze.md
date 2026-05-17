# System TZ Contract Inventory Freeze

- Task: `work-20260515-system-tz-contract-inventory-freeze`
- Lane: `work`
- Status: reviewed inventory/freeze document
- Scope: current AIF Handoff workflow contracts before System TZ platform slices change runtime behavior
- Source intake: `docs/intake/work/work-20260515-system-tz-contract-inventory-freeze.md`
- RDPI sources: `docs/rdpi/work/work-20260515-system-tz-contract-inventory-freeze/research.md`, `docs/rdpi/work/work-20260515-system-tz-contract-inventory-freeze/design.md`, `docs/rdpi/work/work-20260515-system-tz-contract-inventory-freeze/plan.md`

## Freeze Status

This document is inventory-only. It records current contracts and compatibility surfaces; it does not authorize runtime behavior changes, schema changes, validator changes, API changes, MCP changes, UI changes, status updates, memory publication, or task close-out edits.

The current platform already has task intent contracts, plan quality checks, runtime profiles, server-side memory, audit evidence events, audit artifact attempts, workflow timeline DTOs, worktree isolation, auto-review, and usage events. These surfaces are not yet unified into the System TZ trust backbone. Later tasks must treat the mappings below as a freeze of current behavior until their own reviewed RDPI plan changes a specific surface.

No live server probes, scheduler reads, log reads, worker-report reads, endpoint checks, downstream runtime/config reads, or shared-memory recall were used for this inventory.

## Target Backbone

System TZ names the target backbone concepts as:

- `TaskIntentContract`: durable task intent, scope, allowed behavior, defaults, and workflow-specific validation.
- `PlanManifest`: structured plan contract for task id, intent, scope, allowed and forbidden changes, expected artifacts, acceptance criteria, and verification.
- `WorkflowTimeline`: structured task history containing artifacts, attempts, claims, evidence links, and lifecycle events.
- `EvidenceLedger`: append-only evidence units with runtime source, output identity, redaction, source snapshot, and plan binding.
- `ArtifactTrustRollup`: task-level trust summary for artifacts, outcomes, failure families, next action, and branch/worktree source.
- `MemoryClaim`: source-backed knowledge record with approval, redaction, lifecycle, and usage history.
- `RuntimeUsage`: usage event and budget source for runtime/provider/profile calls.

Current code implements parts of these concepts under compatibility names. Generic persistence for workflow runs, generic artifacts, generic claims, generic evidence links, and first-class trust rollups is not the current source of truth.

## Package And Boundary Inventory

Current package boundaries from local docs and static code:

- `packages/shared` owns public task types, task intent vocabulary, schema definitions, plan quality rules, task completion evidence rules, audit validators, audit evidence models, workflow pack registry, and timeline DTO types.
- `packages/data` owns database access, task hydration, memory records, usage persistence, audit evidence persistence, audit artifact state/attempt persistence, trust rollup construction, and workflow timeline construction.
- `packages/api` owns REST routes, WebSocket broadcasts, chat orchestration, roadmap generation, task event transitions, and operator-facing task timeline endpoints.
- `packages/mcp` exposes task data and best-effort task-change broadcasts back through the API.
- `packages/web` consumes task detail, artifact trust, workflow timeline, memory, chat, and runtime surfaces.
- `packages/agent` owns coordinator stage orchestration, planner, plan checker, implementer, reviewer, review gate, memory prompt injection, audit evidence repair, and branch/worktree stage execution.
- `packages/runtime` owns workflow execution abstraction, runtime usage event shape, runtime registry/profile behavior, and Codex audit evidence extraction.

Freeze rule: `api` and `agent` should continue to access durable workflow state through `@aif/data`; behavior-changing System TZ work must not introduce new direct persistence shortcuts.

## Task Intent Inventory

### Shared Contract

Authoritative task intent vocabulary is in `packages/shared/src/taskIntentContracts.ts`. It defines `TASK_INTENTS`, `TaskIntent`, `TaskIntentContract`, and `TASK_INTENT_CONTRACTS`. The shared inference and prompt helpers are in `packages/shared/src/taskIntent.ts`, including `inferTaskIntent`, `resolveTaskIntentDefaults`, and `formatTaskIntentContractForPrompt`.

Current durable task rows store `task_intent` with default `general` in `packages/shared/src/schema.ts`. Shared/public task DTOs expose `taskIntent` in `packages/shared/src/types.ts`.

Current intent behavior includes compatibility inference. Static code treats explicit `taskIntent` as authoritative when valid, but still infers from fields such as `isFix`, title, description, and diagnostic/review/audit language. Diagnostic, review, inventory, gap-analysis, findings, validation, and verification wording can route risky completion behavior through audit-like evidence requirements in `packages/shared/src/taskCompletionEvidence.ts`.

### Data Persistence

`packages/data/src/index.ts` normalizes persisted task intent, applies defaults on create, keeps `taskIntent` and `isFix` coherent, and carries task intent into roadmap batch artifact rows. Task creation applies audit and spike defaults through `resolveTaskIntentDefaults`. Existing task updates can normalize task intent when `taskIntent` or `isFix` changes.

Current freeze: `taskIntent` is persisted on `tasks` and `roadmap_batches`; it is not yet a full System TZ `TaskIntentContract` instance with durable allowed/forbidden changes, evidence obligations, permission policy, or plan manifest hash.

### API

`packages/api/src/routes/tasks.ts` normalizes create/update task intent, keeps `isFix` compatibility, includes artifact trust on task detail, exposes `/tasks/:id/timeline`, and broadcasts task changes through WebSocket payloads.

Task creation still has API-local behavior such as auto branch creation, project parallel-mode constraints, planner mode defaults, and wake broadcasts. These are orchestration behavior, not `TaskIntentContract` v2.

### MCP

`packages/mcp/src/tools/getTask.ts` exposes task fields, including existing activity/log/review fields. `packages/mcp/src/utils/broadcast.ts` sends best-effort task-change broadcasts through the API. MCP does not expose a complete trust backbone, plan manifest, evidence ledger, or memory claim graph.

### Web And Chat

`packages/web/src/lib/api.ts` and `packages/web/src/hooks/useTasks.ts` fetch task detail and workflow timeline. `packages/web/src/components/task/TaskDetail.tsx` renders task worktree data and the timeline panel. `packages/web/src/components/task/WorkflowTimelinePanel.tsx` renders artifact, evidence, claim, attempt, and event rows from the compatibility DTO.

`packages/api/src/routes/chat.ts` builds task context, creates/updates chat sessions, retrieves approved memory for chat prompts, records memory usage events with `workflowKind: "chat"`, and can create task cards. Chat task-intent extraction still has compatibility text guidance for fix-like requests and does not emit a full `TaskIntentContract` manifest.

### Planner, Implementer, Reviewer, Audit

`packages/agent/src/subagents/planner.ts` and `packages/agent/src/subagents/planChecker.ts` consume task intent and workflow context through prompts and plan quality checks. Plan quality is enforced by `packages/shared/src/planQuality.ts`, but current plans remain markdown/checklist text, not first-class `PlanManifest` persistence.

`packages/agent/src/subagents/implementer.ts` implements task work, reads audit artifact context, captures audit evidence units, reads source report artifacts for synthesis, and emits implementation logs. Completion evidence is evaluated later by shared rules, not by a generic implementation manifest.

`packages/agent/src/subagents/reviewer.ts`, `packages/agent/src/reviewContract.ts`, and `packages/agent/src/reviewGate.ts` parse code review, security audit, review-gate findings, manual review handoff, resolved/still-blocking findings, and risky audit/review acceptance. Review findings are currently stored inside task review comments and `autoReviewState`, not as first-class `WorkflowTimeline` claim/review rows.

Audit flow is stricter than generic workflow flow. `packages/shared/src/workflowPacks.ts` keeps the audit pack strict, and `docs/kb/workflow-contract-pack-registry.md` freezes that generated-task validation semantics belong to workflow packs while artifact/completion/review/memory behavior remains out of the registry until separately authorized.

## Artifact States And Attempts

Current durable artifact state is audit/roadmap-specific:

- `packages/shared/src/schema.ts` defines `roadmap_batch_artifacts` with task, batch, role, artifact path, state, classification, failure family, failure signature, validation details, content hash, source snapshot id, branch, worktree, project root, and timestamps.
- `packages/shared/src/schema.ts` defines `roadmap_batch_artifact_attempts` with append-only attempt rows for artifact id, batch, task, role, path, attempt number, boundary id, state, classification, failure family, failure signature, content hash, source snapshot id, rework status, validation details, and timestamps.
- `packages/data/src/index.ts` writes artifacts and attempts through roadmap batch helpers and `updateRoadmapBatchArtifactState`.
- `packages/data/src/index.ts` maps these rows into `WorkflowTimelineArtifact` and `WorkflowTimelineAttempt` compatibility DTOs.

Target mapping:

- `roadmap_batch_artifacts` is the current compatibility current-state source for `ArtifactTrustRollup` and `WorkflowTimeline.artifacts`.
- `roadmap_batch_artifact_attempts` is the current compatibility append-only source for `WorkflowTimeline.attempts`.
- `validationDetailsJson`, `classification`, `failureFamily`, `failureSignature`, `contentSha`, and `sourceSnapshotId` are compatibility fields for future `PlanManifest`, `EvidenceLedger`, and artifact classifier output.

Freeze rule: do not rename, reinterpret, or weaken `roadmap_batch_*` artifact state in generic tasks. Generic artifact persistence belongs to `work-20260515-system-tz-workflow-timeline-trust-backbone` or a narrower approved persistence task.

## Evidence Events And Evidence Ledger

Current durable evidence event storage is audit-named:

- `packages/shared/src/schema.ts` defines `audit_evidence_events`.
- `packages/shared/src/auditEvidenceLedger.ts` defines `AuditEvidenceUnit` and generic aliases such as `EvidenceUnit`, `buildEvidenceUnit`, and `readEvidenceUnitRuntimePayload`.
- `packages/data/src/index.ts` persists and reads evidence through `appendAuditEvidenceEvent`, `listAuditEvidenceEvents`, `appendEvidenceUnitEvent`, and `listEvidenceUnitEvents`; the generic aliases still delegate to `audit_evidence_events`.
- `packages/runtime/src/adapters/codex/auditEvidence.ts` extracts Codex runtime evidence descriptors for shell command, file read, and search-like events.
- `packages/agent/src/subagents/implementer.ts` records audit evidence with `auditPlanId`, `sourceSnapshotId`, `evidenceKind`, `evidenceGrade`, `scopeIds`, `riskHypothesisIds`, `outputSha256`, `outputPreview`, and `redactionStatus`.

Target mapping:

- `audit_evidence_events` is the current compatibility source for `EvidenceLedger`.
- `EvidenceUnit` aliases are compatibility names; they do not mean storage has become generic.
- `auditPlanId` and `sourceSnapshotId` are the current provenance anchors.
- `scopeIds` and `riskHypothesisIds` are the current claim-coverage anchors.
- `outputSha256`, bounded preview, preview truncation, command metadata, and redaction status are the current evidence integrity and safety anchors.

Freeze rule: later tasks may add generic evidence names only with explicit compatibility migration. This inventory does not authorize changing audit evidence table names, validator obligations, or ledger semantics.

## Workflow Timeline DTOs

Current shared DTOs are in `packages/shared/src/types.ts`:

- `WorkflowTimelineContext`
- `WorkflowTimelineArtifact`
- `WorkflowTimelineAttempt`
- `WorkflowTimelineClaim`
- `WorkflowTimelineEvidence`
- `WorkflowTimelineEvidenceLink`
- `WorkflowTimelineEvent`
- `WorkflowTimeline`
- `TaskArtifactTrustRollup`

Current construction is in `packages/data/src/index.ts`:

- `buildTaskArtifactTrustRollup(taskId)`
- `buildTaskWorkflowTimeline(taskId)`
- artifact state mapping from roadmap artifact state;
- claim outcome mapping from artifact classification/state;
- evidence mapping from `EvidenceUnit`;
- event rows generated from artifact, attempt, evidence, and task status compatibility sources.

Current exposure:

- `packages/api/src/routes/tasks.ts` attaches `artifactTrust` to task detail and exposes `GET /tasks/:id/timeline`.
- `packages/web/src/components/task/WorkflowTimelinePanel.tsx` renders artifacts, claims, evidence, attempts, and events.

Target mapping:

- Current `WorkflowTimeline` is a DTO/read model, not a generic event-sourced persistence model.
- `WorkflowTimeline.sourceKind` is currently `none` or `roadmap_batch`, which confirms non-audit generic tasks may have no timeline source.
- `compatibilitySource` metadata points to `roadmap_batch_artifact`, `roadmap_batch_artifact_attempt`, and `audit_evidence_event`.

Freeze rule: do not treat the current timeline endpoint as complete proof for generic workflow tasks. It is accepted as an operator read surface over compatibility sources until `work-20260515-system-tz-workflow-timeline-trust-backbone` changes it.

## Memory Records

Current server-side memory is product memory, not Codex shared-memory:

- `packages/shared/src/schema.ts` defines `memory_items`, `memory_usage_events`, and `memory_lifecycle_events`.
- `packages/shared/src/types.ts` defines `MemoryItem`, `MemoryItemStatus`, `MemoryUsageEvent`, and related broadcast types.
- `packages/data/src/index.ts` creates task close-out memory candidates, redacts and truncates memory fields, blocks approval when redaction is blocked, records lifecycle events, retrieves approved memory, and records usage events.
- `packages/api/src/routes/memory.ts` exposes list/create/update/approve/reject/expire and usage/lifecycle routes.
- `packages/agent/src/memoryContext.ts` injects approved memory into planner/implementer/reviewer prompts and records usage events.
- `packages/api/src/routes/chat.ts` injects approved memory into chat prompts and records usage events with `workflowKind: "chat"`.

Target mapping:

- `memory_items` is the current compatibility source for `MemoryClaim`.
- `memory_lifecycle_events` is the current compatibility lifecycle/audit trail for claim review.
- `memory_usage_events` is the current compatibility usage trail for where approved memory influenced chat or task workflows.
- Current memory records have status, scope, project, source task, redaction, review note, tags, content, and timestamps. They do not yet carry first-class source-backed claim IDs, supersedes/contradicts relationships, or last validated evidence bindings.

Freeze rule: do not use Codex shared-memory recall as a source of truth for this repo's runtime memory. Source-backed memory work belongs to `work-20260515-system-tz-source-backed-memory-knowledge`.

## Runtime Usage Events

Current runtime usage contracts:

- `packages/runtime/src/types.ts` defines `RuntimeUsageContext` and `RuntimeUsage`.
- `packages/runtime/src/usageSink.ts` defines `RuntimeUsageEvent` and `RuntimeUsageSink`.
- `packages/shared/src/schema.ts` defines `usage_events`.
- `packages/data/src/index.ts` records usage events and rolls usage deltas into aggregate fields while staying structurally typed against runtime usage sink shape.

Target mapping:

- `usage_events` is the current compatibility persistence source for `RuntimeUsage`.
- Runtime usage context currently captures task/project/stage/runtime/profile/provider/workflow-style context, but runtime limit snapshots and budget policy are not yet unified into the trust backbone.

Freeze rule: budget enforcement, limit snapshot persistence, and operator-visible usage governance belong to `work-20260515-system-tz-runtime-governance-usage-budget`.

## Branch, Worktree, And Orchestration Fields

Current branch/worktree fields:

- `packages/shared/src/schema.ts` stores `tasks.branch_name` and `tasks.worktree_path`.
- `packages/shared/src/schema.ts` stores `roadmap_batch_artifacts.branch_name` and `roadmap_batch_artifacts.worktree_path`.
- `packages/shared/src/types.ts` exposes `branchName` and `worktreePath` on task and artifact trust DTOs.
- `packages/data/src/index.ts` detects active branch-bound tasks with `branchName` and no isolated `worktreePath`.
- `packages/api/src/services/taskEvents.ts` treats `task.branchName` as source-of-truth for branch-bound mutations, restores persisted branch for already-bound tasks, creates a feature branch for unbound tasks, and runs from `task.worktreePath` when present.
- `packages/api/src/services/commitGeneration.ts` also treats `task.branchName` as a source-of-truth contract and runs from task worktree when available.
- `packages/web/src/components/task/TaskDetail.tsx` and `WorkflowTimelinePanel.tsx` expose worktree and branch/worktree artifact metadata.

Target mapping:

- `branchName` and `worktreePath` are current orchestration provenance fields and should be carried into `WorkflowTimeline`, `ArtifactTrustRollup`, `EvidenceLedger`, and future `SourceSnapshot`.
- `worktreePath` indicates isolated execution root; absence of worktree with branch binding has serialization implications.

Freeze rule: do not collapse branch/worktree fields into generic strings or remove them from operator surfaces. Orchestration hardening belongs to `work-20260515-system-tz-orchestration-worktree-reliability`.

## Review Findings And Gates

Current review contracts:

- `packages/agent/src/subagents/reviewer.ts` prompts for code review and security audit output, requires repository inspection evidence for audit/review/discovery/report tasks, blocks placeholder evidence, and treats audit/report artifacts strictly.
- `packages/agent/src/reviewContract.ts` parses structured review findings, including sources such as code review, security audit, and review gate, and resolved/still-blocking status.
- `packages/agent/src/reviewGate.ts` blocks risky audit/review/discovery acceptance without substantive review evidence, validates audit completion evidence, and blocks audit inconclusive or validator issues.
- `packages/agent/src/coordinator.ts` records manual review handoff, rework requests, auto-review findings, stalled rework loops, audit artifact state updates, and review iteration counts.
- `packages/shared/src/schema.ts` stores `review_iteration_count`, `auto_review_state_json`, `review_comments`, `manual_review_required`, and related task fields.

Target mapping:

- Current review findings are compatibility claims over task comments and `autoReviewState`.
- Review gate findings should become future `WorkflowTimelineClaim` or review-event rows, but no first-class review findings table exists in this inventory.
- Audit validator failures are current containment and must remain fail-closed.

Freeze rule: review/security closure changes belong to `work-20260515-system-tz-review-security-rework-closure`; security permission policy belongs to `work-20260515-system-tz-security-permission-policy`.

## API, WebSocket, MCP, And UI Exposure

Current operator exposure is split:

- REST task detail includes `artifactTrust` from `buildTaskArtifactTrustRollup`.
- REST timeline endpoint returns `WorkflowTimeline`.
- WebSocket task broadcasts send task payloads through `toTaskBroadcastPayload`; they do not broadcast complete timeline or evidence graph state.
- MCP `getTask` exposes task fields and logs but not the complete trust backbone.
- Web renders task detail, worktree path, artifact trust summary, timeline panel, chat, memory dialogs, and runtime/memory surfaces through separate APIs.

Compatibility risk: API docs, MCP sync docs, WebSocket payloads, and UI panels are not a single canonical trust surface. Later operator-facing work must compare docs against code and avoid treating stale docs as runtime truth.

Freeze rule: API/WS/UI unification belongs to `work-20260515-system-tz-operator-api-ws-trust-surfaces`; chat and MCP attachment gate changes belong to `work-20260515-system-tz-chat-mcp-attachments-gates`.

## Duplicated, Obsolete, Audit-Specific, And Compatibility-Only Paths

The following paths are frozen as current inventory. They may be changed only by a later approved task that names the path and preserves fail-closed behavior where applicable.

| Category                                        | Current path                                                                                                                                                                          | Inventory note                                                                                                                                                                 | Follow-up owner                                                                                |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Audit-specific task inference leak              | `packages/shared/src/taskCompletionEvidence.ts`                                                                                                                                       | Risky audit/review/discovery/inventory language can trigger audit-like completion evidence even when generic task intent is not a first-class audit contract.                  | `work-20260515-system-tz-task-intent-contract-v2`                                              |
| Shared task intent v1                           | `packages/shared/src/taskIntentContracts.ts`, `packages/shared/src/taskIntent.ts`                                                                                                     | Current contracts define defaults and prompt text but not durable allowed/forbidden changes, permission policy, evidence obligations, or plan manifest binding.                | `work-20260515-system-tz-task-intent-contract-v2`                                              |
| Workflow pack boundary                          | `packages/shared/src/workflowPacks.ts`, `docs/kb/workflow-contract-pack-registry.md`                                                                                                  | Packs own generated-task validation only; artifact/completion/review/memory behavior is intentionally outside the registry.                                                    | Blocked until explicit pack expansion task                                                     |
| API-local roadmap audit hooks                   | `packages/api/src/services/roadmapGeneration.ts`, `packages/api/src/services/roadmapWorkflowPacks.ts`                                                                                 | Audit roadmap behavior remains API-local and dependency-heavy. Generic roadmap import must not inherit audit semantics.                                                        | `work-20260513-move-audit-roadmap-hooks-behind-pack` and System TZ task intent follow-up       |
| Audit artifact persistence as generic timeline  | `packages/shared/src/schema.ts`, `packages/data/src/index.ts`                                                                                                                         | `roadmap_batch_artifacts` and attempts are mapped into generic timeline DTOs but remain audit/roadmap compatibility sources.                                                   | `work-20260515-system-tz-workflow-timeline-trust-backbone`                                     |
| Audit evidence table with generic aliases       | `packages/shared/src/auditEvidenceLedger.ts`, `packages/data/src/index.ts`                                                                                                            | `EvidenceUnit` aliases still persist through `audit_evidence_events`; generic name is compatibility, not a storage migration.                                                  | `work-20260515-system-tz-workflow-timeline-trust-backbone` and audit classifier/evidence tasks |
| Audit validator containment                     | `packages/shared/src/auditReportValidator.ts`, `packages/shared/src/auditSynthesisClassifier.ts`, `packages/shared/src/taskCompletionEvidence.ts`, `packages/agent/src/reviewGate.ts` | Markdown validators, synthesis classifier, completion evidence, and review gate are immediate containment. They must not be weakened while migrating to provenance.            | `work-20260515-system-tz-audit-classifier-synthesis-v2`                                        |
| Coordinator completion/audit routing            | `packages/agent/src/coordinator.ts`                                                                                                                                                   | Coordinator contains audit evidence repair, artifact state updates, completion evidence handling, review/rework loops, and manual review blocked reasons.                      | `work-20260515-system-tz-development-evidence-completion-guard` and review closure task        |
| API task transition routing                     | `packages/api/src/services/taskEvents.ts`                                                                                                                                             | Task event handling owns branch restoration, audit artifact path/readiness data, completion transitions, and broadcast types. Some behavior overlaps coordinator expectations. | `work-20260515-system-tz-orchestration-worktree-reliability`                                   |
| Timeline DTO compatibility overlay              | `packages/shared/src/types.ts`, `packages/data/src/index.ts`, `packages/api/src/routes/tasks.ts`, `packages/web/src/components/task/WorkflowTimelinePanel.tsx`                        | Timeline reads are generated from current audit/roadmap/evidence rows; generic tasks may have `sourceKind: none`.                                                              | `work-20260515-system-tz-workflow-timeline-trust-backbone`                                     |
| Review findings as comments/state               | `packages/agent/src/reviewContract.ts`, `packages/agent/src/reviewGate.ts`, `packages/agent/src/coordinator.ts`                                                                       | Findings are parsed from review comments and auto-review state; no durable review findings table exists.                                                                       | `work-20260515-system-tz-review-security-rework-closure`                                       |
| Runtime usage without budget backbone           | `packages/runtime/src/usageSink.ts`, `packages/runtime/src/types.ts`, `packages/shared/src/schema.ts`, `packages/data/src/index.ts`                                                   | Usage events persist and aggregate, but runtime limits and budgets are not yet deterministic trust inputs.                                                                     | `work-20260515-system-tz-runtime-governance-usage-budget`                                      |
| Server-side memory without source-backed claims | `packages/shared/src/schema.ts`, `packages/data/src/index.ts`, `packages/api/src/routes/memory.ts`, `packages/agent/src/memoryContext.ts`                                             | Memory has approval/redaction/usage lifecycle but lacks source-backed claim graph fields.                                                                                      | `work-20260515-system-tz-source-backed-memory-knowledge`                                       |
| WebSocket/MCP partial trust surfaces            | `packages/api/src/ws.ts`, `packages/api/src/routes/tasks.ts`, `packages/mcp/src/tools/getTask.ts`, `packages/mcp/src/utils/broadcast.ts`                                              | Broadcast and MCP payloads are partial task surfaces; they do not expose the full trust backbone.                                                                              | `work-20260515-system-tz-operator-api-ws-trust-surfaces`                                       |
| Chat task creation and memory injection         | `packages/api/src/routes/chat.ts`, `packages/web/src/lib/chatActions.ts`, `packages/web/src/components/chat/*`                                                                        | Chat can create tasks and inject memory, but attachments, gates, and intent/evidence contracts are not backbone-complete.                                                      | `work-20260515-system-tz-chat-mcp-attachments-gates`                                           |

## Open Decisions Mapped To Blocked Decisions Or Queued Tasks

| Open decision                                                                                                  | Current freeze                                                                                                                                      | Owner                                                           |
| -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Should audit tables remain compatibility sources or be replaced by generic persistence?                        | Blocked. Keep `roadmap_batch_*` and `audit_evidence_events` as current sources until migration design explicitly dual-writes, adapts, or backfills. | `work-20260515-system-tz-workflow-timeline-trust-backbone`      |
| Should task intent inference keep routing generic diagnostic/review/inventory language to audit-like behavior? | Blocked. Preserve current inference and risky completion containment until intent v2 defines explicit audit-only gates.                             | `work-20260515-system-tz-task-intent-contract-v2`               |
| Should plans become durable manifests?                                                                         | Blocked. Preserve markdown/checklist plan behavior until manifest schema and quality gate are approved.                                             | `work-20260515-system-tz-plan-manifest-quality-gate`            |
| Should completion evidence be unified with implementation manifests?                                           | Blocked. Preserve current completion evidence and audit guard behavior.                                                                             | `work-20260515-system-tz-development-evidence-completion-guard` |
| Should WebSocket/MCP expose complete timeline, trust, runtime, memory, and branch/worktree fields?             | Blocked. Preserve current partial payloads and timeline REST endpoint.                                                                              | `work-20260515-system-tz-operator-api-ws-trust-surfaces`        |
| Should review findings become durable claims/events?                                                           | Blocked. Preserve review comments and `autoReviewState` as current source.                                                                          | `work-20260515-system-tz-review-security-rework-closure`        |
| Should runtime usage events enforce budgets or runtime limits?                                                 | Blocked. Preserve usage event persistence and aggregation only.                                                                                     | `work-20260515-system-tz-runtime-governance-usage-budget`       |
| Should memory records become source-backed claim graphs?                                                       | Blocked. Preserve memory approval/redaction/lifecycle/usage behavior.                                                                               | `work-20260515-system-tz-source-backed-memory-knowledge`        |
| Should branch/worktree provenance become source snapshot identity?                                             | Blocked. Preserve branch/worktree fields and current execution-root behavior.                                                                       | `work-20260515-system-tz-orchestration-worktree-reliability`    |
| Should audit no-findings trust depend only on provenance-era evidence?                                         | Blocked. Preserve markdown validator containment and inventory-only no-findings inconclusive behavior.                                              | `work-20260515-system-tz-audit-classifier-synthesis-v2`         |
| Should chat/MCP attachments participate in plan/evidence gates?                                                | Blocked. Preserve current chat/MCP task and memory behavior.                                                                                        | `work-20260515-system-tz-chat-mcp-attachments-gates`            |
| Should configuration become governed as a trust input?                                                         | Blocked. Preserve current config docs/env behavior.                                                                                                 | `work-20260515-system-tz-configuration-governance`              |
| Should System TZ completion be declared by regression corpus?                                                  | Blocked. No completion claim until corpus is implemented.                                                                                           | `work-20260515-system-tz-golden-regression-corpus`              |

## Freeze Rules For Later System TZ Tasks

1. Treat this document as a Phase 0 planning source, not as permission to change behavior.
2. Preserve current audit validators, completion evidence, synthesis classifier, and review-gate fail-closed behavior unless a later task explicitly replaces a rule with equal or stronger containment.
3. Preserve lane-aware task IDs and paths in all artifacts.
4. Preserve `taskIntent`, `branchName`, `worktreePath`, artifact path, batch id, attempt number, source snapshot id, audit plan id, evidence ids, and review iteration fields when migrating data or DTOs.
5. Do not rename or reinterpret `roadmap_batch_*` or `audit_evidence_events` in place. Use explicit adapters, dual-write, or migration/backfill plans when authorized.
6. Do not treat current generic aliases (`EvidenceUnit`, `WorkflowTimeline`, `TaskArtifactTrustRollup`) as proof that generic persistence exists.
7. Do not hide untrusted, invalid, missing, inconclusive, or compatibility-only artifacts behind a green task status.
8. Do not widen workflow-pack ownership beyond generated-task validation unless a task explicitly moves artifact, completion, review, memory, or runtime behavior into packs.
9. Do not use stale API docs, MCP docs, or UI assumptions as authoritative when static code disagrees.
10. Do not add live runtime probing, scheduler/log reads, or memory recall as evidence for contract changes unless the task's approved RDPI plan authorizes it.
11. Convert implementation discoveries into blocked decisions or separate intake cards; do not create and execute derived behavior changes inside an inventory or audit task.
12. Keep future changes reviewable, deterministic, and narrowly scoped to the owning System TZ task.

## Verification Notes

This artifact was prepared from static local planning artifacts, docs, and code reads only. Build and test commands are not required for this documentation-only inventory. Later implementation tasks must run their own focused tests and independent gates according to their approved RDPI plans.
