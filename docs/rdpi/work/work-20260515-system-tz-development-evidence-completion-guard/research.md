# Research

## Task Framing And Lane

- Task ID: `work-20260515-system-tz-development-evidence-completion-guard`
- Lane: `work`
- RDPI needed: yes
- Intake source: `docs/intake/work/work-20260515-system-tz-development-evidence-completion-guard.md`
- Requested outcome: add development evidence and an implementation completion guard for `feature`, `fix`, `tests`, and `docs` tasks.
- Explicit exclusions: do not force audit reports through development evidence semantics, do not store raw full command output when hash plus preview is sufficient, and preserve `skipReview` only after the minimum guard passes.

## Accepted Planning Sources Or Local Facts

- `docs/kb/system-tz-contract-inventory-freeze.md` is the accepted Phase 0 planning source for the System TZ batch. It freezes current behavior and maps `TaskIntentContract`, `PlanManifest`, `WorkflowTimeline`, `EvidenceLedger`, `ArtifactTrustRollup`, `MemoryClaim`, and `RuntimeUsage` target concepts.
- The freeze document names this task as the owner for unifying completion evidence with implementation manifests while preserving current audit validator containment.
- `docs/rdpi/work/work-20260515-system-tz-plan-manifest-quality-gate/result.md` records that `aif-plan-manifest` validation is already implemented for full-mode plans and exported through shared plan quality types.
- Current plan manifest schema is in `packages/shared/src/planQuality.ts`. `AifPlanManifest` records `taskId`, `intent`, `scope`, `allowedChanges`, `forbiddenChanges`, `expectedArtifacts`, `acceptanceCriteria`, and `verificationCommands`.
- Current task intent policies are in `packages/shared/src/taskIntentContracts.ts`. Relevant development intents:
  - `feature`: allows source, tests, docs, and config as needed, forbids report work, and requires acceptance and verification.
  - `fix`: allows narrow source/test/docs/config changes, forbids report/research drift, and requires reproduction or observed failure plus regression verification.
  - `docs`: documentation-only unless the pre-implementation task context explicitly allows support edits for docs correctness.
  - `tests`: tests/fixtures-only unless the pre-implementation task context explicitly justifies support source edits.
- `packages/shared/src/taskIntent.ts` already validates docs/tests/spike/audit changed-file policy through `validateTaskIntentChangedFiles`.
- Current completion evidence is centralized in `packages/shared/src/taskCompletionEvidence.ts`. It already collects git changed files, dirty files, committed files, intent policy issues, audit report validation, review-stage tool activity, and formatted blocked reasons.
- Current terminal transition hooks are in:
  - `packages/agent/src/coordinator.ts`, where `blockTaskForCompletionEvidenceIfNeeded` runs before skip-review `done`, review-gate accepted `done`, and generic terminal success.
  - `packages/api/src/services/taskEvents.ts`, where human `start_implementation` and `approve_done` paths call the same shared evaluator.
- Current generic workflow timeline projection already names `implementation_manifest`, `source_diff`, `test_result`, `review_report`, and `commit_evidence` in `packages/shared/src/types.ts` and `packages/data/src/index.ts`.
- Current generic timeline projection treats a populated `task.implementationLog` as backing evidence for `implementation_manifest`, `source_diff`, and `test_result`. This contradicts the intake requirement that implementation logs stop being treated as proof.
- Current durable task schema has `plan`, `implementation_log`, `review_comments`, and `agent_activity_log` but no structured implementation manifest field.
- Existing audit evidence storage remains audit-named (`audit_evidence_events`) and must not be repurposed as generic development evidence in this task.
- The worktree was already dirty before this task. This task must preserve prior changes and only add compatible, task-specific edits.

## Same-Project Memory

- `docs/memory/projects/aif-handoff/capsule.md` currently records the latest same-project capsule from `work-20260515-system-tz-audit-classifier-synthesis-v2`.
- Relevant reusable facts from that capsule:
  - Public audit source report outcomes are limited to `validated_findings_present`, `validated_no_findings`, and `source_inconclusive`.
  - Inventory-only and weak source reports remain untrusted.
  - `source_inconclusive` is terminal diagnostic output, not positive source evidence.
- These facts reinforce that this task must not weaken audit/report validation while adding development evidence semantics.

## Cross-Project Reusable Patterns

- No cross-project reusable memory was needed. Local System TZ docs and same-project artifacts were sufficient.

## Rejected Or Stale Memory Candidates

- No shared-memory recall was used. The task is repo-specific, and pre-plan RDPI boundaries prohibit live memory/runtime probing unless explicitly waived.

## Implementation Hypotheses

- Add a shared `ImplementationManifest` contract rather than continuing to infer trust from prose logs.
- Persist the manifest on the task record as JSON (`implementation_manifest_json`) for this first slice. This is narrower than introducing a generic evidence table and avoids reusing audit evidence tables prematurely.
- The manifest should bind to the approved plan by a plan manifest hash derived from the `aif-plan-manifest` block when present.
- The completion guard should require valid development evidence only for `feature`, `fix`, `docs`, and `tests` terminal transitions. Audit tasks continue using existing audit report semantics.
- The generic timeline should treat `implementation_manifest` as trusted only when the manifest JSON is valid; `implementationLog` can remain operator context but should no longer be proof.
- The implementation manifest should store bounded evidence previews and hashes, not raw full command output.
