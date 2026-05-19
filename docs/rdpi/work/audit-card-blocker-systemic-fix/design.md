# Design: Audit Card Blocker Systemic Fix

## Target Behavior

For roadmap audit source report cards:

- first run and retry run both use deterministic report generation/repair
- weak legacy scopes do not escape into Qwen/Claude runtime
- terminal weak/inconclusive source output is persisted on the artifact
- task automation does not require manual review unless an independent manual blocker exists
- synthesis can still consume terminal weak/inconclusive source artifacts as weak inputs

For runtime/backoff generally:

- automatic release from `blocked_external` preserves retry count
- manual handoff broadcasts are reserved for true manual-review/operator states
- manual-review-required blocked tasks cannot be resumed by the generic retry action

## Implementation Strategy

### 1. Remove Audit Runtime Escape

Delete or neutralize the `isRetryingTerminalSourceInconclusiveAuditReport()` runtime bypass. Invert the existing regression test so a retried terminal legacy audit card does not call runtime.

### 2. Expand Deterministic Audit Report Handling

Treat every `roadmapBatchArtifacts.role === "report"` task as owned by deterministic audit report handling before generic runtime prompt construction.

Cases:

- readable declared scope: run deterministic audit report repair/generation
- non-readable scope: persist terminal `source_inconclusive`
- repeated deterministic failure: persist terminal `source_inconclusive`
- already-valid report: skip runtime and clear rework flags
- final fallback guard: if `expectedAuditReportArtifactPath` remains unresolved, terminalize deterministically instead of calling runtime

Legacy generated cards with readable source files can be normalized by deterministic repair even when their risk text is generic. The resulting artifact remains strict: it is trusted only if validation passes; otherwise it is terminal `source_inconclusive`.

### 3. Complete Non-Manual Source Inconclusive Tasks

Do not change the validated 2026-05-15 decision that terminal `source_inconclusive` roadmap source reports use task status `blocked_external`, not `done`.

For audit source report terminal inconclusive outcomes that do not require operator input, persist artifact state `source_inconclusive`, keep `manualReviewRequired=false`, and keep the existing `blocked_external` terminal-untrusted surface. The systemic fix is that these outcomes are reached deterministically and never through runtime fallback.

Manual exception, branch isolation, missing access, and required production validation remain blocked/manual where appropriate.

### 4. Fix Retry And Manual State Boundaries

Change automatic release of due `blocked_external` tasks to preserve `retryCount`.

Change operator broadcast selection so `task:manual_handoff_required` is emitted only for a defined manual/operator predicate:

- `manualReviewRequired === true`
- `blockedReason` starts with `operator_input_required:`
- `blockedReason` contains manual-review/manual-exception language
- `blockedReason` is a no-retry branch isolation/config-governance/access/permission blocker
- artifact trust failure family/state is `manual_review_required` or `manual_exception` when available through the existing rollup

Change `retry_from_blocked` to reject manual-review-required blocked tasks unless a dedicated manual exception/resolution path is used.

### 5. Tighten Audit Card Contract

Add lightweight shared validation for weak generated audit source cards:

- reject metadata-only and broad top-level roots as source scope unless paired with concrete module/file roots
- reject generic owner-area risk hypotheses that do not bind to concrete scoped evidence

This reduces future weak v17-style cards entering the pipeline.

## Expected Result

Audit source cards may finish as trusted valid or terminal untrusted `source_inconclusive`, but they should not enter model runtime and should not create Qwen/runtime `blocked_external` loops. True untrusted audit-source terminalization remains visibly blocked by the established lifecycle instead of being green `done`.
