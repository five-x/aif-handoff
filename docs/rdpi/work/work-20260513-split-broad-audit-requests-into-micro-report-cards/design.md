# Design: Split Broad Audit Requests Into Micro Report Cards

## Chosen design

Use the existing typed audit roadmap batch as the decomposition model.

Broad audit requests go through the audit roadmap path:

- deterministic classification marks the request as requiring decomposition;
- generation/import emits multiple source report cards plus one synthesis card;
- each source card has concrete scope roots, risk hypotheses, a single report artifact, report-only allowed changes, evidence requirements, and acceptance criteria;
- the roadmap batch and artifact rows track child completion and retry attempts;
- the synthesis card stays paused until every required source report reaches a synthesis-ready state;
- final synthesis must report which child reports passed and which were explicitly inconclusive.

Narrow audit requests keep the current single-card behavior through normal task creation. Broad direct audit requests through normal task creation are rejected before execution with guidance to use the audit roadmap decomposition path. This avoids silently creating a single broad audit card while also avoiding automatic child-card creation from the generic task endpoint.

## Pre-PLAN boundary

Before `PLAN PASS`, this task may only record local repo facts, planning artifacts, hypotheses, and verification plans. It must not run live audits, inspect runtime logs, query downstream services, or mark any generated audit cards as validated.

## Decomposition classifier

Add a small shared classifier in `packages/shared/src/auditRoadmapContract.ts`:

- input: audit request title, description/vision text, optional roadmap alias, and optional tags;
- output: `single_report` or `decomposed_report_batch`, a boolean `requiresDecomposition`, and stable reason strings;
- broad signals: whole project/repository/codebase wording, "comprehensive/full audit", "security/performance/correctness/ops" multi-domain requests, "production readiness" style owner-grade audits, or absence of a concrete source/report boundary in an otherwise audit-shaped request;
- narrow signals: a concrete `Scope:` line with source paths and a concrete `Report artifact:` path, or a small explicit file/component target without broad multi-domain wording.

The classifier is deterministic and testable. It does not create tasks by itself; it gives the generation/import path and future plan-checker a stable contract.

## Direct task creation gate

Add a direct creation guard in `packages/api/src/routes/tasks.ts`:

- if `taskIntent` resolves to `audit`, classify the title, description, roadmap alias, and tags before calling `createTask()`;
- if the classifier returns `decomposed_report_batch`, return `400` with a stable error code and message telling the caller to generate/import an audit roadmap instead;
- do not create a task, branch, plan path, roadmap batch, or artifact rows on rejection;
- if the classifier returns `single_report`, continue with the existing direct audit behavior.

The guard is intentionally a rejection, not a hidden redirect. The roadmap path already owns batch creation and source/synthesis card generation, and automatic redirect from `/tasks` would need new API contracts and UI assumptions outside this task.

## Audit roadmap generation

For `taskIntent: "audit"` roadmap generation:

- compute the classifier before runtime generation;
- include the classification and reasons in the prompt so the model cannot treat broad audit work as one source report;
- preserve deterministic fallback generation as the fail-closed broad decomposition path;
- keep all generated source report cards diagnostic-only and report-only;
- add synthesis card instructions requiring a child report status table with passed, failed, and inconclusive child reports.

This path already creates source cards plus synthesis today. The change makes broadness explicit, testable, and visible in generation results.

## Parent and child tracking

Reuse existing tables and semantics:

- `roadmap_batches` is the parent batch;
- `roadmap_batch_artifacts` are child source reports plus the synthesis artifact;
- each child task can be retried independently through the existing artifact attempt lifecycle;
- the synthesis task is the parent close-out surface, paused by `synthesis_not_ready` until the child states are ready.

No generic parent/child task columns are added in this task.

## Synthesis readiness

Current readiness should remain strict for weak reports:

- ready: trusted valid source reports;
- ready: explicitly terminal source inconclusive reports, terminal inconclusive reports, or manual exceptions with required justification;
- not ready: expected, missing, retryable invalid, external blocked, stale-boundary writes, or weak reports still eligible for rework.

This distinction lets the final parent synthesis close as "audit inconclusive" when children terminalize inconclusively, while preventing synthesis from missing or weak child outputs.

## Final synthesis requirements

Generated synthesis cards must require:

- a child report status table naming every source report artifact available to synthesis;
- counts for validated findings, trusted no-findings, failed/weak reports, and inconclusive reports;
- a final outcome no stronger than source report classifications;
- explicit downgrade to audit inconclusive when required child reports are inconclusive or not trusted.

Existing synthesis classifiers and completion evidence checks remain authoritative for whether the produced synthesis can close.

## Compatibility

- Direct narrow audit task creation is unchanged.
- Direct broad audit task creation now fails before execution instead of creating a broad single-card audit.
- Existing non-audit roadmap generation/import is unchanged.
- Existing audit card validation for scope, risk hypotheses, diagnostic-only markers, and report-only allowed changes remains in force.
- Existing retryable invalid report attempts remain blocked from synthesis readiness.
- The separate hierarchy design task remains queued and is not implemented here.

## Decision candidates

- The audit decomposition classifier is a reusable local decision candidate after implementation if it proves stable.
- The "explicitly terminal child states release synthesis as inconclusive-capable but not trusted-valid" readiness rule is a local audit lifecycle decision candidate.
