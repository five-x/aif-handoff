# Design: Unblock Direct Audit Canary Planner Routing

## Chosen design

Direct audit tasks with `taskIntent=audit`, a concrete `Scope:` line, and a concrete `Report artifact: audit/*.md` path will be materialized at task creation as a one-report audit artifact contract. The contract uses the existing roadmap artifact tables with a synthetic direct-audit batch alias, so all existing trusted paths can discover:

- `auditArtifactRole=report`;
- `expectedReportArtifactPath`;
- trusted artifact mode;
- ledger requirement;
- artifact-state updates;
- cleanup and API artifact-trust projection.

This is intentionally additive. It does not alter `auditReportValidator`, `taskCompletionEvidence`, lifecycle verification, or synthesis trust rules.

## Planner and plan-checker design

- Extend plan-quality boundary detection so root-level scoped files such as `README.md`, `AGENTS.md`, and `package.json` count as concrete audit boundaries when they appear in `Scope:`.
- Keep broad direct audit rejection in `POST /tasks`.
- Build deterministic diagnostic plans for direct report artifacts before invoking the free-form planner.
- Make deterministic plans audit/report-specific:
  - task intent: audit;
  - diagnostic-only: yes;
  - expected report artifact;
  - declared scope;
  - allowed write paths limited to the report artifact;
  - trusted artifact, ledger, manifest, source snapshot, and committed blob requirements;
  - no source/config/test/doc edits except the report artifact;
  - local AIF service/e2e forbidden for remote canaries;
  - remote target when the task text declares one.

## Routing design

Task creation becomes the explicit routing source:

1. API accepts only narrow direct audit tasks.
2. API creates the task.
3. API creates a one-report artifact contract for the task when the direct audit task has a concrete report artifact path.
4. Planner and plan-checker read `findRoadmapBatchArtifactByTaskId()`.
5. Implementer reads the same artifact and sets workflow metadata:
   - `workflowKind=audit`;
   - `profileMode=audit`;
   - `allowedWritePaths=[expectedReportArtifactPath]`;
   - `auditReportArtifactPath=expectedReportArtifactPath`.
6. Runtime tools enforce scoped report writes and validator context.
7. Completion evidence runs trusted artifact mode, requires ledger evidence, verifies lifecycle, and updates artifact state.
8. Failed/untrusted report artifacts are backed up and removed by the existing cleanup path.

## Audit writer contract

Keep the existing strict prompt contract and make the machine-readable contract explicit when an audit report artifact is expected:

```yaml
auditWriterContract:
  taskIntent: audit
  canaryKind: positive_trusted_audit | negative_fabricated_audit | null
  expectedReportArtifactPath: audit/<name>.md
  allowedWritePaths:
    - audit/<name>.md
  declaredScopeRoots:
    - <scope root>
  allowedEvidenceRefs:
    - ev_...
  trustRequired:
    manifest: true
    ledger: true
    sourceSnapshot: true
    committedBlob: true
  forbidden:
    - fabricated command output
    - fake commit hashes
    - basename-only file refs
    - future-tense verification
    - local AIF validation
    - source code changes
```

## Cleanup design

No validator changes are needed. Cleanup should continue to run only through terminal blocked/inconclusive artifact paths and only for untrusted, untracked report artifacts with a backup recorded in validation details. Creating an artifact row for direct audit tasks makes direct negative canaries eligible for the existing cleanup path.

## Pre-PLAN boundary

Before `PLAN PASS`, work is limited to local source/docs inspection and RDPI artifacts. No remote health checks, task creation, scheduler/log probing, local AIF service, localhost browser, or shared-memory recall is allowed.

## Decision candidates

- Direct, single-report audit tasks should be treated as artifact-backed audit batches with one report artifact rather than generic task records.
- Root-level files named in `Scope:` should be accepted as concrete audit boundaries for narrow canaries.
