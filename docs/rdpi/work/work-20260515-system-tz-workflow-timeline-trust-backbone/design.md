# Design

## Approach

Implement a generic compatibility read model over current task records while preserving the existing roadmap batch read model for audit rows.

This task will not introduce new generic persistence tables. The source of truth remains current task fields, memory item rows, roadmap batch artifacts, attempts, and audit evidence events. The change is to make `WorkflowTimeline` and `TaskArtifactTrustRollup` consistently represent those sources for every workflow kind.

## Shared contract

- Add an exported generic artifact kind vocabulary in `packages/shared/src/types.ts`:
  - `plan`
  - `plan_manifest`
  - `implementation_manifest`
  - `source_diff`
  - `test_result`
  - `review_report`
  - `security_report`
  - `audit_report`
  - `audit_synthesis`
  - `memory_candidate`
  - `commit_evidence`
- Extend `WorkflowTimelineSourceKind` with a task-record source kind for compatibility projections from `tasks` and `memory_items`.
- Keep existing claim outcomes and trust levels unchanged:
  - outcomes: `supported`, `refuted`, `inconclusive`, `blocked`, `waived`, `not_evaluated`.
  - trust levels: `trusted`, `weak`, `untrusted`.
- Extend next-action values only as needed for generic task states; do not remove existing audit next actions.

## Generic projection rules

For tasks without a roadmap batch artifact:

- Build artifacts from concrete task fields and memory candidates:
  - `plan` when `task.plan` exists.
  - `plan_manifest` when `task.plan` has a valid manifest according to `evaluateTaskPlanQuality()`, or an untrusted/weak manifest artifact when a manifest is required but missing/invalid.
  - `implementation_manifest`, `source_diff`, and `test_result` when `task.implementationLog` exists. These represent the current implementation output, changed-file evidence, and verification evidence surface, not parsed truth from markdown.
  - `review_report` and `security_report` when `task.reviewComments` exists.
  - `memory_candidate` for `memory_items` rows with `sourceTaskId = task.id`.
  - `commit_evidence` as a conservative expected/weak artifact for terminal implemented tasks when branch or worktree data exists, because commit lifecycle is currently broadcast but not durably attached to tasks.
- Every artifact gets exactly one compatibility attempt. Trusted generic artifacts therefore always have an attempt.
- Every artifact gets a current claim. Claims use the same outcome/trust vocabulary as audit compatibility claims.
- Generated evidence rows are explicit task-record evidence, not audit ledger evidence:
  - plan content evidence,
  - implementation log evidence,
  - review comments evidence,
  - blocker evidence for `blockedReason` or manual review,
  - memory candidate evidence.
- Every blocker links to a blocker claim and blocker evidence link.
- Event rows are generated for artifact creation/update, attempt recording, claim evaluation, and evidence recording.

## Conservative trust rules

- `trusted` only when the task has reached `done` or `verified` and the artifact has concrete backing data.
- `weak` for planned/in-progress/expected outputs and memory candidates waiting for review.
- `untrusted` for blocked/manual-review output, missing required plan manifest, invalid plan manifest, or other explicit blockers.
- A `done` task with an untrusted artifact remains untrusted in the rollup. UI presentation must not turn that into a green state.

## Rollup rules

- Existing roadmap rollup behavior remains the priority path.
- Generic fallback `TaskArtifactTrustRollup` selects the highest-priority generic artifact:
  - blocked/untrusted first,
  - then weak,
  - then trusted,
  - then most recent updated artifact.
- Rollup fields are populated from the selected artifact and its claim:
  - task status,
  - artifact role/kind/state/trust,
  - claim outcome,
  - failure family and reason codes,
  - next action and label,
  - artifact path when available,
  - task-record batch/source id,
  - attempt number,
  - failure signature,
  - branch/worktree data.
- Generic `batchCounts` reuse the existing shape:
  - `trustedValid`: trusted artifact count.
  - `inconclusive`: weak/inconclusive artifact count.
  - `rejected`: untrusted/refuted artifact count.
  - `missing`: missing/expected required artifact count.
  - `externalBlocked`: blocker count.
  - `synthesisPending`: weak expected output count.
  - `total`: artifact count.

## Web behavior

- The existing `WorkflowTimelinePanel` already renders generic artifacts, evidence, claims, attempts, events, reason codes, branch, worktree, and failure signatures.
- Update only if tests show missing labels for new generic states or source kind. Avoid a broader UI redesign.
- `TaskDetailHeader` already shows trust rollup details. Ensure generic untrusted rollups render warning/error styling, not success.

## Risks

- Treating task logs as artifacts could imply stronger evidence than they provide. Mitigation: metadata must mark `compatibilitySource: task_record`, summaries should describe the source, and trust remains conservative.
- Commit evidence is not currently durable on the task row. Mitigation: represent it as expected/weak unless stronger data exists, and do not claim a commit was made from broadcast-only events.
- Plan manifest details are only exposed as validation summary today. Mitigation: use `evaluateTaskPlanQuality()` rather than reimplementing parsing or parsing markdown manually.
