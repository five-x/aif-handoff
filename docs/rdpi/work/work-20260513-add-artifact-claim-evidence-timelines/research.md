# Research - Add Artifact Claim And Evidence Timelines

## Task framing and lane

- Task: `work-20260513-add-artifact-claim-evidence-timelines`.
- Lane: `work`.
- Intake card: `docs/intake/work/work-20260513-add-artifact-claim-evidence-timelines.md`.
- Request: add API and UI surfaces for generic artifact, claim, and evidence timelines across workflow packs, preserving audit compatibility and covering at least one non-audit workflow shape.
- RDPI needed: yes.
- Preflight: `codex-ensure-rdpi.py` reported `STATUS: ready`.
- Flow audit: `codex-flow-audit.py --repo .` reported `STATUS: clean`.

## Accepted planning sources or local facts

- Local instructions require RDPI gates before implementation: independent `PLAN PASS`, `TEST PASS`, and `REVIEW PASS`.
- The selected intake card depends on accepted persistence design from `work-20260513-design-generic-artifact-claim-persistence`.
- `docs/rdpi/work/work-20260513-design-generic-artifact-claim-persistence/result.md` says that task completed as design-only. It intentionally did not add source implementation, database migration, runtime persistence, API route, or UI surface.
- `docs/rdpi/work/work-20260513-design-generic-artifact-claim-persistence/design.md` defines future pack-neutral concepts: workflow runs, workflow artifacts, artifact attempts, workflow claims, and workflow evidence links.
- The persistence design explicitly preserves existing audit compatibility sources: `roadmap_batches`, `roadmap_batch_artifacts`, `roadmap_batch_artifact_attempts`, and `audit_evidence_events`.
- The persistence design names two future migration modes: adapter-only generic summaries over existing audit rows, or dual-write/backfill. Since no `workflow_*` schema exists in source, this task should select adapter-only rather than invent durable persistence.
- `docs/rdpi/work/work-20260513-generalize-evidence-unit-aliases/result.md` says generic evidence unit aliases were added over the existing audit evidence ledger storage path. Durable storage remains `audit_evidence_events`.
- `docs/kb/workflow-contract-pack-registry.md` says artifact, completion, review, and memory behavior remain deferred and should not be moved into the registry without separate authorization.
- Current source contains audit/roadmap persistence tables in `packages/shared/src/schema.ts` and `packages/shared/src/db.ts`, but no `workflow_runs`, `workflow_artifacts`, `workflow_artifact_attempts`, `workflow_claims`, or `workflow_evidence_links` implementation.
- Current data access in `packages/data/src/index.ts` already exposes audit compatibility readers and writers, including roadmap batch artifacts, artifact attempts, and evidence unit event aliases.
- Current task API in `packages/api/src/routes/tasks.ts` exposes task detail, comments, events, and plan-file status, but no structured artifact/claim/evidence timeline endpoint.
- Current web task detail UI in `packages/web/src/components/task/TaskDetail.tsx` has implementation, review, comments, and activity tabs. Activity uses `AgentTimeline`, which parses unstructured activity log text and is not a structured artifact/claim/evidence timeline.
- The worktree is dirty with unrelated modified and untracked files from earlier runs. This task must avoid reverting unrelated changes and keep its own edits scoped.

## Same-project memory

- Not queried before `PLAN PASS`. Local repo facts and accepted RDPI artifacts were sufficient for planning, and the RDPI boundary prohibits pre-plan shared-memory recall unless explicitly waived.

## Cross-project reusable patterns

- Not queried before `PLAN PASS`.
- Reusable local pattern from the accepted persistence design: add adapter-only generic summaries over compatibility rows before adding new durable generic tables.

## Rejected or stale memory candidates

- Any claim that generic workflow persistence is already implemented is rejected by current source search. The only `workflow_*` table references are in RDPI design documents, not source code.
- Live runtime, scheduler, endpoint, log, or worker evidence was not collected before the plan gate.

## Open questions

- When the future generic persistence implementation lands, should this adapter-only endpoint switch to a generic repository or support both generic and compatibility sources in one response? This task can leave that as a documented migration path.
- Should artifact-specific evidence links eventually be derived from report manifest evidence refs, or only from durable generic evidence links? This task should not parse artifacts or add file IO to the timeline read path.

## Hypotheses

- A task-scoped API endpoint can expose a stable generic timeline DTO without database migration by mapping audit compatibility rows into generic artifact, attempt, claim, evidence, and link shapes.
- Non-audit workflows can use the same DTO today and return an empty artifact/claim/evidence timeline with workflow context, proving the UI and API are not audit-only without inventing persistence rows.
- A focused UI component can render audit-compatible populated data and non-audit empty or mock generic data without overloading the existing activity-log timeline.
- Focused shared/data/API/web tests can cover the adapter surface while preserving current audit behavior.
