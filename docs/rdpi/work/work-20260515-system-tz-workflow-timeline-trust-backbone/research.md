# Research

## Task framing and lane

- Task ID: `work-20260515-system-tz-workflow-timeline-trust-backbone`.
- Lane: `work`.
- Intake card: `docs/intake/work/work-20260515-system-tz-workflow-timeline-trust-backbone.md`.
- RDPI needed: yes.
- Goal: make `WorkflowTimeline` and `TaskArtifactTrustRollup` usable as the task trust backbone for every workflow kind, not only audit.

## Accepted planning sources or local facts

- Preflight passed: `codex-ensure-rdpi.py` reported `STATUS: ready`; `codex-flow-audit.py --repo .` reported `STATUS: clean`.
- `docs/kb/system-tz-contract-inventory-freeze.md` is the accepted Phase 0 inventory for this System TZ batch.
- Existing shared DTOs live in `packages/shared/src/types.ts`: `WorkflowTimelineContext`, `WorkflowTimelineArtifact`, `WorkflowTimelineAttempt`, `WorkflowTimelineClaim`, `WorkflowTimelineEvidence`, `WorkflowTimelineEvidenceLink`, `WorkflowTimelineEvent`, `WorkflowTimeline`, and `TaskArtifactTrustRollup`.
- Existing API exposure is already present:
  - `packages/api/src/routes/tasks.ts` attaches `artifactTrust` to task route responses.
  - `packages/api/src/routes/tasks.ts` exposes `GET /tasks/:id/timeline`.
- Existing web exposure is already present:
  - `packages/web/src/components/task/WorkflowTimelinePanel.tsx` renders artifacts, evidence, claims, attempts, and events.
  - `packages/web/src/components/task/TaskDetailHeader.tsx` renders `artifactTrust`.
- Current data-layer construction is audit-first:
  - `buildTaskArtifactTrustRollup(taskId)` returns `null` unless `findRoadmapBatchArtifactByTaskId(taskId)` finds a row.
  - `buildTaskWorkflowTimeline(taskId)` returns an empty generic envelope for non-audit tasks before reading any task-local artifacts.
  - `artifactKindFromCompatibilityRole()` maps only roadmap roles to `audit.source_report` and `audit.synthesis_report`.
- Current task rows already contain generic workflow evidence anchors that can be projected without schema migration:
  - `plan`, `planPath`, `implementationLog`, `reviewComments`, `agentActivityLog`, `blockedReason`, `manualReviewRequired`, `status`, `branchName`, `worktreePath`, timestamps, and intent fields.
  - `memory_items` has `sourceTaskId`, `sourceRef`, `status`, redaction fields, timestamps, and source kind for close-out memory candidates.
- Existing plan manifest support lives in `packages/shared/src/planQuality.ts`; `evaluateTaskPlanQuality()` reports manifest presence/status and issue codes, but not the full expected artifact list.
- Current generic evidence rows still come from `audit_evidence_events`. The freeze doc says not to rename or weaken this ledger during this task.
- The worktree is already dirty from prior System TZ tasks. This task must preserve those edits and only layer compatible changes onto current files.

## Same-project memory

- `docs/memory/tasks/work/work-20260513-add-artifact-claim-evidence-timelines-delta.md` records that the timeline API shape is generic, audit roadmap rows are mapped into artifacts/attempts/claims/evidence/events, and non-audit tasks previously returned empty arrays until durable generic persistence existed.
- The same delta records a pattern to expose one generic task-scoped timeline DTO rather than audit-specific task fields.
- `docs/memory/decisions/decision-1c285a9147bdea42.md` says not to parse artifact markdown in the timeline endpoint; durable evidence rows and artifact rows remain accepted compatibility sources.
- `docs/memory/tasks/work/work-20260515-system-tz-contract-inventory-freeze-delta.md` records that the current generic timeline and trust rollup are compatibility read models over audit/roadmap/evidence rows, not first-class generic persistence.
- The freeze delta also records that audit validators, completion evidence, synthesis classifier, and review-gate behavior are containment and must remain fail-closed until later approved tasks replace them.

## Cross-project reusable patterns

- None used. Local repo facts and same-project memory were sufficient.

## Rejected or stale memory candidates

- The predecessor memory statement that non-audit tasks should return empty timeline arrays is stale for this task because the intake card explicitly asks to make the timeline and trust rollup central for all workflow kinds.
- No shared-memory recall was used; local docs and curated repo memory covered the planning need.

## Scope boundaries

- In scope:
  - Define generic artifact kind vocabulary for plan, plan manifest, implementation manifest, source diff, test result, review report, security report, audit report, audit synthesis, memory candidate, and commit evidence.
  - Add a deterministic non-audit compatibility projection from task rows and memory candidate rows into `WorkflowTimeline`.
  - Add non-audit `TaskArtifactTrustRollup` fallback so task detail/list responses are not audit-only.
  - Preserve roadmap batch artifacts as the stronger source when they exist.
  - Preserve manual exception behavior and audit fail-closed validators.
  - Keep blockers traceable to a claim and evidence link in the generic projection.
- Out of scope:
  - Full database schema migration to durable generic artifact/claim/evidence tables.
  - WebSocket/MCP expansion for complete timeline and trust payloads; the inventory maps that to the operator API/WS trust surfaces task.
  - Audit validator, synthesis classifier, review/security closure, runtime governance, and source-backed memory redesign.
  - Parsing artifact markdown to infer factual trust beyond existing task state and deterministic metadata.

## Hypotheses

- H1: A deterministic task-record projection can make the central trust surfaces useful for all workflow kinds without weakening audit-specific containment.
- H2: Treating trusted generic artifacts as requiring an attempt row prevents green status from hiding unattempted outputs.
- H3: For non-audit tasks, task status plus field presence can drive conservative trust: `verified` or `done` with concrete output is trusted, in-progress/blocked output is weak or untrusted, and blocked tasks are traceable through generated blocker evidence.
- H4: Keeping roadmap batch artifacts ahead of task-record projection preserves audit behavior and minimizes regression risk.
