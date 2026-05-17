# Research

## Task framing and lane

- Task: `work-20260515-system-tz-contract-inventory-freeze`.
- Lane: `work`.
- Intake card: `docs/intake/work/work-20260515-system-tz-contract-inventory-freeze.md`.
- RDPI needed: yes.
- Scope: create a reviewed inventory and freeze document for current AIF Handoff workflow contracts before System TZ platform slices change runtime behavior.
- Output must be inventory-only. It may document current contracts, mappings, duplicated paths, open decisions, and queued follow-up references, but it must not change runtime behavior or weaken existing audit validators.

## Accepted planning sources or local facts

- `AGENTS.md`, `.agents/skills/runtask/SKILL.md`, and `.agents/skills/rdpi/SKILL.md` require local repo facts first, planning-only RDPI artifacts before `PLAN PASS`, independent plan/test/review gates, and `$memsync MODE=auto` before RDPI-backed close-out.
- `python "$env:USERPROFILE\.codex\tools\codex-ensure-rdpi.py"` returned `STATUS: ready`.
- `python "$env:USERPROFILE\.codex\tools\codex-flow-audit.py" --repo .` returned `STATUS: clean`; no mixed-intake-model quarantine was required.
- Immutable task card source: `docs/intake/work/work-20260515-system-tz-contract-inventory-freeze.md`.
- Explicit System TZ source: `C:\Users\apron\Desktop\aif_handoff_system_tz.md`, sections 2, 3, 23 Phase 0, and 27.
- System TZ section 2 states the current package split: `shared`, `runtime`, `data`, `api`, `web`, and `agent`; it also states that `api` and `agent` should access the database only through `@aif/data`.
- System TZ section 2 lists the current lifecycle as `Backlog -> Planning -> Plan Ready -> Implementing -> Review -> Done -> Verified` with request changes, auto-review rework, manual review handoff, `blocked_external`, stale watchdog, heartbeat, runtime-limit auto-pause, scheduling, auto-queue, parallel execution, and branch/worktree isolation.
- System TZ section 2 identifies existing server-side memory tables and lifecycle: `memory_items`, `memory_usage_events`, `memory_lifecycle_events`, `pending`, `approved`, `rejected`, `expired`, redaction checks, human approval, and reference-only injection into planner, implementer, reviewer/security, and chat.
- System TZ section 2 identifies existing audit evidence pieces: `auditEvidenceLedger.ts`, `audit_evidence_events`, `sourceSnapshotId`, `auditPlanId`, `evidenceKind`, `evidenceGrade`, `scopeIds`, `riskHypothesisIds`, `outputSha256`, `outputPreview`, `redactionStatus`, manifest validation, issue codes, and classification source outcome.
- System TZ section 3 defines the target backbone as `TaskIntentContract`, `PlanManifest`, `WorkflowTimeline`, `EvidenceLedger`, `ArtifactTrustRollup`, `MemoryClaim`, and `RuntimeUsage`.
- System TZ section 23 Phase 0 requires documenting current task intents, artifact states, evidence events, table-to-target mappings, and duplicated or obsolete code paths.
- System TZ section 27 states that the current platform already has agent pipeline, runtime profiles, server-side memory, audit evidence events, roadmap batches, artifact attempts, workflow timeline types, parallel execution, worktrees, auto-review, and usage events, but they are not yet unified into a deterministic trust backbone.
- `docs/architecture.md` documents the package boundaries, runtime registry/profile resolution, server-side memory loop, agent pipeline, state machine, scheduler, auto-queue, and worktree behavior.
- `docs/api.md` documents REST, memory, runtime defaults, and WebSocket contracts; some contract details are likely stale or inconsistent with static code and must be marked as such in the inventory rather than treated as accepted runtime truth.
- `docs/mcp-sync.md` documents MCP tool surfaces, Handoff-managed vs manual-MCP modes, task lifecycle sync, and broadcast behavior.
- `docs/kb/workflow-contract-pack-registry.md` freezes the current workflow pack registry: core shared code owns task intent vocabulary/defaults/prompt formatting/public validation, workflow packs own generated-task validation semantics, the audit pack is strict, and artifact/completion/review/memory behavior remains out of the registry until separately authorized.
- `docs/kb/audit-evidence-provenance-contract.md` freezes audit evidence provenance as a target contract: markdown is compatibility input, inventory-only evidence cannot prove no-findings, provenance requires plan/snapshot/evidence bindings, and runtime/schema changes are deferred to later implementation tasks.
- Static explorer slice 1 identified current task/audit contract surfaces in `packages/shared/src/taskIntentContracts.ts`, `packages/shared/src/taskIntent.ts`, `packages/shared/src/workflowPacks.ts`, `packages/shared/src/auditRoadmapContract.ts`, `packages/shared/src/planQuality.ts`, `packages/shared/src/taskCompletionEvidence.ts`, `packages/shared/src/auditReportValidator.ts`, `packages/shared/src/auditEvidenceLedger.ts`, `packages/shared/src/auditSourceEvidence.ts`, `packages/shared/src/auditSynthesisClassifier.ts`, `packages/agent/src/coordinator.ts`, `packages/agent/src/subagents/planner.ts`, `packages/agent/src/subagents/planChecker.ts`, `packages/agent/src/subagents/implementer.ts`, `packages/agent/src/subagents/reviewer.ts`, `packages/agent/src/reviewContract.ts`, `packages/api/src/routes/tasks.ts`, `packages/api/src/services/taskEvents.ts`, `packages/api/src/services/roadmapGeneration.ts`, and `packages/data/src/index.ts`.
- Static explorer slice 2 identified current schema/DTO/exposure surfaces in `packages/shared/src/types.ts`, `packages/shared/src/schema.ts`, `packages/data/src/index.ts`, `packages/api/src/routes/tasks.ts`, `packages/web/src/hooks/useTasks.ts`, `packages/web/src/lib/api.ts`, `packages/web/src/components/task/TaskDetail.tsx`, `packages/web/src/components/task/WorkflowTimelinePanel.tsx`, `packages/api/src/ws.ts`, `packages/mcp/src/tools/getTask.ts`, `packages/mcp/src/utils/broadcast.ts`, `packages/api/src/routes/memory.ts`, `packages/agent/src/memoryContext.ts`, `packages/api/src/routes/chat.ts`, `packages/runtime/src/usageSink.ts`, and `packages/runtime/src/registry.ts`.
- Current worktree is dirty with unrelated existing edits and untracked intake/RDPI/memory artifacts. This task must not revert or reformat unrelated changes.
- Pre-task dirty source baseline captured before this task wrote planning or KB artifacts:
  - `packages/agent/src/__tests__/implementer.test.ts`
  - `packages/agent/src/__tests__/reviewGate.test.ts`
  - `packages/agent/src/reviewGate.ts`
  - `packages/agent/src/subagents/implementer.ts`
- These source modifications are not owned by this documentation-only inventory task.

## Same-project memory

- Same-project local memory artifacts were not queried before `PLAN PASS`; the task card and local docs are sufficient for planning.
- After `PLAN PASS`, same-project memory may be inspected only if needed to validate whether the inventory should cite previous RDPI close-out decisions. Local repo facts and the current docs still outrank memory.

## Cross-project reusable patterns

- No cross-project memory was queried before `PLAN PASS`.
- Reusable planning pattern from local instructions: inventory/discovery tasks produce accepted planning artifacts and queued follow-up decisions only; they do not execute derived implementation work in the same run.

## Rejected or stale memory candidates

- Treat API/MCP/WebSocket docs as candidates to compare against code, not authoritative by themselves, because static research found mismatches in task broadcast payloads, memory usage events, and timeline/artifact exposure.
- Treat generic workflow timeline persistence as not yet implemented for non-audit tasks. Current evidence indicates generic timeline DTOs are compatibility overlays over audit/roadmap tables.

## Open questions

- Whether the target System TZ backbone should keep audit tables as compatibility sources or introduce first-class generic persistence for artifact attempts, claims, evidence links, and trust rollups.
- Whether task intent inference should continue classifying generic diagnostic/review/inventory/gap-analysis language as `audit`, or whether explicit task intent should become mandatory for audit-only gates.
- Whether duplicated completion evidence routing in coordinator and API event handling should be unified under a single shared service.
- Whether WebSocket/MCP contracts should expose full task detail, artifact trust, timeline rows, branch/worktree fields, runtime limit snapshots, and memory usage events consistently.
- Whether unstructured `agentActivityLog` should remain separate from the structured workflow timeline or become an event source in the unified backbone.

## Hypotheses

- A single inventory/freeze document under `docs/kb/` can satisfy Phase 0 without runtime changes by mapping each current surface to the target backbone and clearly marking compatibility-only DTOs.
- The highest-risk drift surfaces are duplicated audit validators and route-specific task state/completion logic, not the database schema itself.
- The inventory should freeze audit validators as current containment and explicitly defer behavior changes to sibling System TZ cards.
