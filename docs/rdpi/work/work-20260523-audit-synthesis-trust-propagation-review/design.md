# Design

## Chosen design

Run a diagnostic trust-propagation review, not an implementation change.

The review will map the trust boundary in six layers and then test or construct focused examples only after `PLAN PASS`:

1. Source report validation: `validateAuditReportArtifact()` and `evidenceDepth.trustedNoFindingsSupported`.
2. Synthesis classification: `classifyAuditSynthesisSourceReports()`, `parseAuditSynthesisOutcomeFromText()`, `combineAuditSynthesisOutcomes()`, and `classifyAuditSynthesisOutput()`.
3. Task completion evidence: `evaluateTaskCompletionEvidence()` for audit synthesis artifacts and review handoff/completion phases.
4. Data-layer roadmap trust: `validationDetailsHaveTrustedAuditSourceClassification()`, `roadmapArtifactCountsAsValid()`, `artifactTrustedForSynthesisInput()`, batch status, and synthesis input selectors.
5. Workflow timeline/API projections: `buildTaskArtifactTrustRollup()`, `buildTaskWorkflowTimeline()`, artifact claim outcomes, trust levels, and audit-card decisions.
6. Agent repair/review paths: coordinator terminalization, deterministic audit synthesis in implementer, deterministic audit repair, reviewer output, and review gate handling.

The output of this diagnostic task will be `result.md` with a source-backed path map, evidence table, and verdict. If a promotion path is confirmed, create a separate queued implementation intake card with RDPI scaffold and stop at intake for that follow-up.

## Pre-PLAN boundary

Before `PLAN PASS`, allowed work is limited to:

- reading the task card, local guidance, local docs, local source, and local curated memory files;
- running the required repo preflight/audit scripts;
- writing planning-only `research.md`, `design.md`, and `plan.md`;
- using an independent explorer for planning-grade static source mapping.

Before `PLAN PASS`, this task must not:

- collect runtime-visible evidence, inspect live workers/logs/schedulers/endpoints, or query shared memory;
- run verification commands that claim the trust propagation result;
- edit production code or tests;
- create follow-up implementation cards before a promotion path is confirmed.

## Diagnostic evidence model

For each trust path, record:

- source and destination of trust state;
- exact file/function references;
- trusted-success preconditions;
- fail-closed behavior for shallow, missing, stale, contradictory, or `source_inconclusive` evidence;
- focused verification command or constructed example used after `PLAN PASS`;
- verdict: `fail_closed`, `promotion_path_confirmed`, or `not_applicable`.

`promotion_path_confirmed` means shallow or `source_inconclusive` evidence can become trusted `validated_no_findings` without satisfying the substantive original evidence and risk-binding requirements.

## Follow-up policy

- If no promotion path is confirmed, do not create implementation cards.
- If a promotion path is confirmed, queue exactly one or more narrow implementation intake cards, each with RDPI scaffold, and do not execute them in this run.
- Do not modify production code in this diagnostic task.

## Decision candidates

- Downstream trust propagation should use fail-closed predicates that include original source evidence depth, not only public no-findings vocabulary or artifact counts.
- Terminal `source_inconclusive` can be a completed diagnostic artifact, but it must remain untrusted for synthesis, task completion, and workflow timeline trust.
