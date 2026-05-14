<!-- Managed task artifact for work-20260513-make-audit-report-rework-deterministic-until-valid. -->

# Design

## Chosen design

Implement a full-context deterministic audit report repair finalization path inside `packages/agent/src/subagents/implementer.ts`.

The implementer already owns deterministic report rewriting and can run before the coordinator moves a task back to review. That makes it the smallest safe place to enforce the task invariant: after deterministic repair writes the artifact, validate the artifact using the same strict context the completion guard depends on. If validation is trusted-valid, clear `reworkRequested` and allow the task to return to review. If validation is `source_inconclusive`, terminalize the roadmap artifact as non-trusted and stop the task from returning to review. If validation still has unresolved manifest, ledger, scope, or substantive-evidence issues, terminalize as manual-review-required with exact issue codes and artifact path.

The design preserves existing successful feature and non-audit task flows because it only activates for roadmap report artifacts with audit repair signals or current validator issue codes.

## Detailed approach

- Add or strengthen a helper that validates an audit report artifact with full context:
  - task id;
  - roadmap batch id;
  - roadmap alias;
  - audit plan id through existing batch/task identity;
  - expected report artifact path;
  - runtime audit ledger evidence from existing `listAuditEvidenceEvents()`;
  - ledger requirement when evidence exists or the artifact contract requires it.
- Add a post-write deterministic repair finalizer:
  - run `runDeterministicAuditReportRepair()` or fold its write/commit logic into the new finalizer;
  - read the repaired artifact;
  - validate with the full-context helper;
  - update artifact state and task fields based on validation outcome.
- Treat outcomes as:
  - `validated_no_findings` or `validated_findings_present` with `validation.ok=true`: artifact state valid; implementation may move to review.
  - `source_inconclusive`: artifact state `source_inconclusive`, rework cleared, task blocked or otherwise terminalized before review as a non-trusted source.
  - unresolved strict validator issues: artifact state/manual-review status with exact issue codes and artifact path; task blocked before review with `manualReviewRequired=true` and `reworkRequested=false`.
- Replace repeated deterministic repair fallback:
  - when the artifact still has deterministic-repair issue codes after a prior deterministic repair attempt, do not call runtime implementation;
  - terminalize as `manual_review_required` with the current validator issue codes and artifact path.
- Keep deterministic repair's trusted no-findings rules from the prior source-inconclusive task: generic scoped evidence must remain inconclusive unless risk-specific evidence is bound.

## Pre-PLAN boundary

- Before `PLAN PASS`, only planning artifacts and local source inspection are allowed.
- No runtime service checks, live task server reads, worker logs, or shared-memory recall are allowed before `PLAN PASS`.
- Code edits, test execution, and live evidence collection start only after independent `PLAN PASS`.

## Decision candidates

- Deterministic report repair must be self-validating before review handoff.
- Repeated strict validator failures should terminalize with exact validator issue codes instead of falling through to general LLM implementation.
- `source_inconclusive` remains a terminal non-trusted audit source, not a trusted valid report.
