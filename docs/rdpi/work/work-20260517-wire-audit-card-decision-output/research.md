# Research

## Task framing and lane

- Task id: `work-20260517-wire-audit-card-decision-output`.
- Lane: `work`.
- Request: wire `classifyAuditCardDecision()` into the real audit card/result output so the user-facing card/report/API/UI exposes the classifier decision, and weak/discarded findings do not force `rework_required`, `blocked_external`, `source_inconclusive`, `weak_sources`, or manual review without an independent OTZ, verification, access, or production-validation blocker.

## Accepted planning sources

- Governing instructions: root `AGENTS.md`; user-provided AGENTS instructions; RDPI skill at `.agents/skills/rdpi/SKILL.md`.
- Preflight: `python "$env:USERPROFILE\.codex\tools\codex-ensure-rdpi.py"` returned `STATUS: ready`.
- Repo state: `git status --short` was clean before RDPI artifacts.
- Helper contract: `packages/shared/src/auditCardDecision.ts` defines `AuditCardDecision` with `requirementCompletion`, `verificationStrength`, `auditFindingValidity`, `residualRisks`, and `finalStatus`; `classifyAuditCardDecision()` returns `closed_verified` for satisfied OTZ criteria and `verificationStrength: "verified"` regardless of weak/discarded finding counts.
- Existing unit coverage: `packages/shared/src/__tests__/auditCardDecision.test.ts` covers weak findings staying separate from `finalStatus`, but this is helper-level only.
- Current report output path: deterministic audit synthesis markdown is produced in `packages/agent/src/subagents/implementer.ts`. `buildDeterministicAuditSynthesisContent()` calls `buildAuditCardDecisionSection()` at `packages/agent/src/subagents/implementer.ts:2112`. The card section calls `classifyAuditCardDecision()` at `packages/agent/src/subagents/implementer.ts:697` and `packages/agent/src/subagents/implementer.ts:722`.
- Current report output gap: `formatAuditCardDecisionRow()` and the table header at `packages/agent/src/subagents/implementer.ts:666` and `packages/agent/src/subagents/implementer.ts:754` expose final decision and some inputs, but omit first-class `requirementCompletion` and `verificationStrength`.
- Current coordinator status path: `packages/agent/src/coordinator.ts` imports and calls `evaluateTaskCompletionEvidence()` at `packages/agent/src/coordinator.ts:48`, `packages/agent/src/coordinator.ts:1158`, and `packages/agent/src/coordinator.ts:1324`; failed evidence maps to artifact state through `firstAuditFailureFamily()` and `artifactStateForFailureFamily()` at `packages/agent/src/coordinator.ts:432` and `packages/agent/src/coordinator.ts:461`; valid artifacts persist only `validationDetails: { evidence: result.evidence }` at `packages/agent/src/coordinator.ts:1174`.
- Current API/manual path: `packages/api/src/services/taskEvents.ts` mirrors the coordinator evidence guard by importing `evaluateTaskCompletionEvidence()` at `packages/api/src/services/taskEvents.ts:7`, deriving failure family at `packages/api/src/services/taskEvents.ts:148`, mapping artifact state at `packages/api/src/services/taskEvents.ts:161`, and persisting valid audit artifacts at `packages/api/src/services/taskEvents.ts:755`.
- Current API/UI exposure path: API route responses attach `artifactTrust: buildTaskArtifactTrustRollup(task.id)` in `packages/api/src/routes/tasks.ts:198` and the dedicated `/tasks/:id/artifact-trust` endpoint returns the same rollup at `packages/api/src/routes/tasks.ts:300`.
- Current shared type gap: `Task.artifactTrust` exists at `packages/shared/src/types.ts:235`; `TaskArtifactTrustRollup` at `packages/shared/src/types.ts:324` has artifact state/trust/next action fields but no audit card decision field.
- Current data rollup path: `buildTaskArtifactTrustRollup()` in `packages/data/src/index.ts:5575` builds UI/API trust from persisted roadmap artifact state, not from `AuditCardDecision`.
- Current UI path: `TaskDetailHeader` renders artifact trust and manual review at `packages/web/src/components/task/TaskDetailHeader.tsx:112`, `packages/web/src/components/task/TaskDetailHeader.tsx:130`, and `packages/web/src/components/task/TaskDetailHeader.tsx:233`; `TaskDetail` overview reads `task.artifactTrust` at `packages/web/src/components/task/TaskDetail.tsx:468`.
- Weak-section handling already exists in validation: `stripNonBlockingWeakFindingSections()` strips weak/discarded sections before classification in `packages/shared/src/auditReportValidator.ts:255` and is used in `evaluateTaskCompletionEvidence()` at `packages/shared/src/taskCompletionEvidence.ts:1290`.
- Existing validator regression: `packages/shared/src/__tests__/auditReportValidator.test.ts:217` covers a report with `No validated findings` plus `## Weak/discarded findings`, and validates that weak/discarded content stays out of final source classification.

## Same-project memory

- Local curated memory in `docs/memory/decisions/decision-af37dbfadf334bae.md` says `blocked_external` should mean external intervention is required, not report content invalidity.
- Local curated memory in `docs/memory/decisions/decision-7e281ad210f9b29c.md` says recoverable audit artifact/content failures map to rework, not `blocked_external`.
- Local curated memory in `docs/memory/decisions/decision-b615fe90af0495c9.md` says `source_inconclusive` remains terminal non-trusted audit source, not trusted valid report.
- No shared-memory server recall was performed before `PLAN PASS`; local memory documents were used only after local repo facts.

## Cross-project reusable patterns

- Additive output fields should be carried through shared type definitions, data rollups, API route responses, and UI renderers rather than introducing frontend-only recomputation.
- Keep strict artifact validation separate from final card decision classification: validation may reject malformed/missing/inaccessible artifacts; weak/discarded findings inside an otherwise valid report should remain diagnostic, not terminal.

## Rejected or stale memory candidates

- Older local RDPI notes that moved terminal `source_inconclusive` report tasks to `done` appear superseded by later notes requiring blocked/manual handling for unresolved untrusted artifacts. This task does not need to settle that broader lifecycle tension; it only covers valid OTZ/no-findings output with weak/discarded non-promoted claims.

## Open questions

- Whether to add a new database column for audit card decisions. Initial design should avoid schema churn by persisting the decision in existing artifact `validation_details_json`, because the current artifact lifecycle already persists validation details and exposes them via trust/timeline projections.
- Whether to expose the decision as a separate top-level `Task` field or inside `artifactTrust`. Initial design should place it in `TaskArtifactTrustRollup.auditCardDecision` because API/UI already consume `artifactTrust` as the audit result card surface.

## Hypotheses

- Persisting `auditCardDecision` in validation details when an audit artifact is accepted, then projecting it through `buildTaskArtifactTrustRollup()` and workflow timeline metadata, will make the real UI/API/report consume `classifyAuditCardDecision()` without changing the database schema.
- Expanding the deterministic report card matrix to include `requirementCompletion` and `verificationStrength`, and adding a weak/discarded findings section for omitted weak findings, will satisfy the report-output part of the request.
- A coordinator-level regression can be built with a committed valid audit report artifact containing `No validated findings` plus `## Weak/discarded findings`; after the reviewer gate accepts, the task should be `done`, artifact trust should expose `auditCardDecision.finalStatus = "closed_verified"`, and `manualReviewRequired` should remain false.
