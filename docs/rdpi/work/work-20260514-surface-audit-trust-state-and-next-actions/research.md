# Research - Surface Audit Trust State And Next Actions

## Task framing and lane

- Task ID: `work-20260514-surface-audit-trust-state-and-next-actions`
- Lane: `work`
- Intake card: `docs/intake/work/work-20260514-surface-audit-trust-state-and-next-actions.md`
- RDPI needed: yes
- Request: expose audit artifact trust state, synthesis readiness, and next operator action in API and UI so `done` tasks with untrusted artifacts cannot be read as successful audit conclusions.
- Preflight: `codex-ensure-rdpi.py` returned `STATUS: ready`; `codex-flow-audit.py --repo .` returned `STATUS: clean`.
- Worktree note: the repository is already dirty with predecessor audit changes and untracked intake/RDPI files. Implementation must avoid reverting or reformatting unrelated files.

## Accepted planning sources or local facts

- The intake card defines the acceptance surface: task responses need compact artifact rollup fields, cards must distinguish `done / untrusted artifact` from `done / trusted valid`, roadmap or batch views need child counts, synthesis cards need an explicit waiting/blocked reason, retry actions must be contextual, and timeline must link artifacts, claims, evidence, attempts, and paths.
- `docs/kb/audit-evidence-provenance-contract.md` defines the trust boundary: source reports can be trusted only when provenance and classifier rules support them. `source_inconclusive`, missing, invalid, and terminal inconclusive states cannot become trusted no-findings.
- `docs/rdpi/work/work-20260513-add-artifact-claim-evidence-timelines/result.md` records an existing generic timeline surface: shared `WorkflowTimeline*` DTOs, `buildTaskWorkflowTimeline(taskId)`, `GET /tasks/:id/timeline`, and web rendering for artifacts, claims, attempts, evidence, links, and events.
- `docs/rdpi/work/work-20260513-design-generic-artifact-claim-persistence/design.md` says UI/API should read generic summaries and adapters, not infer trust from artifact paths or prose. It also keeps existing audit tables as the compatibility source until a separate migration.
- `docs/rdpi/work/work-20260514-terminalize-roadmap-audit-stalls-as-inconclusive/result.md` records the immediate operator-confusion source: roadmap report tasks may end as `done` while their persisted artifact is `source_inconclusive` with terminal rework status.
- `docs/rdpi/work/work-20260514-route-recoverable-audit-failures-to-rework-or-input/result.md` records current retry semantics: recoverable local failures route to implementation rework while review budget remains, operator input waits are explicit holds, and terminal no-progress guards do not become blind retry loops.
- `packages/shared/src/types.ts` has `Task` DTO fields for status, blocked reason, roadmap alias, tags, and existing generic `WorkflowTimeline*` types, but no compact task-level artifact trust rollup.
- `packages/shared/src/schema.ts` stores audit compatibility data in `roadmap_batches`, `roadmap_batch_artifacts`, and `roadmap_batch_artifact_attempts`. Artifact rows already have `role`, `artifactPath`, `state`, `failureFamily`, `validationDetailsJson`, `contentSha`, `attemptNumber`, `attemptBoundaryId`, and `failureSignature`.
- `packages/data/src/index.ts` already has the key trust predicates: `hasTrustedAuditSourceClassification`, `roadmapArtifactCountsAsValid`, `roadmapSourceArtifactTerminalForSynthesis`, and `roadmapSourceArtifactReadyForSynthesis`.
- `packages/data/src/index.ts` currently summarizes batch counts as `expected`, trusted `valid`, `invalid`, `missing`, `synthesisNotReady`, `externalBlocked`, and `total`. It does not expose requested operator buckets such as trusted valid, inconclusive, rejected, missing, external blocked, synthesis pending, or next action.
- `packages/data/src/index.ts` maps audit compatibility rows to the generic timeline, including mapped artifact state, claim outcome, and trust level. Original audit state and failure family are currently nested in metadata.
- `packages/api/src/routes/tasks.ts` exposes task list/detail via `toTaskRouteResponse()`, which currently adds only `effectiveRuntime` to `toTaskResponse()`. The task list/detail API does not include audit trust rollup data.
- `packages/api/src/routes/tasks.ts` exposes `GET /tasks/:id/timeline`, but timeline data is detail-only and not visible on board/list rows.
- `packages/api/src/repositories/tasks.ts` broadcasts only `{ id, title, status }`. A compact rollup added to normal task responses may require either richer broadcast payloads or the existing client invalidation path to refetch task lists.
- `packages/web/src/components/kanban/TaskCard.tsx`, `TaskListTable.tsx`, and `TaskDetailHeader.tsx` display normal task status plus manual review/blocked state. They do not surface artifact trust on `done` tasks.
- `packages/web/src/components/task/WorkflowTimelinePanel.tsx` already shows artifacts, claims, attempts, evidence, and path data, but can make trust and original audit state clearer using the same rollup fields.
- Existing focused tests are available in `packages/api/src/__tests__/tasks.test.ts`, `packages/data/src/__tests__/workflowTimeline.test.ts` or nearby data tests, `packages/web/src/__tests__/TaskCard.test.tsx`, `TaskListTable.test.tsx`, `TaskDetailHeader.test.tsx`, and `WorkflowTimelinePanel.test.tsx`.

## Same-project memory

Shared-memory recall was not used before `PLAN PASS` because the active repository RDPI contract forbids shared-memory recall before the plan gate unless explicitly waived. Local code, KB docs, ops docs, intake, and predecessor RDPI artifacts were sufficient for planning.

## Cross-project reusable patterns

No cross-project memory was used before `PLAN PASS` for the same reason. The design stays within local adapter and DTO patterns already present in this repository.

## Rejected or stale memory candidates

None evaluated. Any later memory sync must publish only curated non-secret findings after implementation and gates pass.

## Planning hypotheses

- H1: A data-layer compatibility adapter can produce a compact, generic `artifactTrust` rollup from existing audit rows without changing audit lifecycle semantics or adding schema.
- H2: Adding the rollup to normal task list/detail responses is enough for board, list, and detail header surfaces to prevent `done` from reading as success when the artifact is untrusted.
- H3: Batch-level counts can be derived from existing artifact rows and included in each child/synthesis task rollup without introducing a new roadmap API.
- H4: Contextual next actions can be derived deterministically from artifact role, artifact state, failure family, task status, latest attempt rework status, and synthesis readiness.
- H5: Timeline rendering can stay generic by displaying `trustLevel`, original state, failure family/reason codes, attempts, and paths from existing metadata rather than adding audit-only timeline components.
