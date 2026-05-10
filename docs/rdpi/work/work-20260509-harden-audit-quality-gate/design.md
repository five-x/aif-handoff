# Design

Task ID: `work-20260509-harden-audit-quality-gate`
Lane: `work`
Date: 2026-05-09

## Goals

- Reject generic or circular audit reports even when they are committed and produced by a tool-capable implementer.
- Require audit/review/discovery report artifacts to contain inspectable, non-circular evidence.
- Prevent auto-review fallback/parser acceptance from approving audit output unless repository-backed review evidence is present.
- Preserve existing fail-closed behavior for missing report artifacts, uncommitted report artifacts, invalid repository paths, deterministic fallback reports, and missing implementation tool activity.
- Keep the implementation explicit, reviewable, and covered by focused unit/integration tests before live server-67 validation.

## Non-Goals

- Do not execute child implementation tasks created by audit findings during this run.
- Do not redesign the full auto-review workflow or database schema.
- Do not rely on hidden runtime behavior or prompts alone as the hard quality gate.
- Do not publish raw live logs, raw secrets, or uncurated RDPI notes to shared memory.

## Proposed Code Shape

### 1. Add Substantive Report Quality Evidence

Extend `packages/shared/src/taskCompletionEvidence.ts` with a new completion issue code such as `insufficient_report_evidence`.

For risky audit/review/discovery report artifacts, the guard should continue to require existing repository path references, then also require at least one substantive evidence marker from the report text:

- an exact repository file reference with a line number, such as `packages/shared/src/taskCompletionEvidence.ts:419`;
- a function/symbol/class reference tied to an existing path, such as `evaluateTaskCompletionEvidence` near `packages/shared/src/taskCompletionEvidence.ts`;
- a command-output evidence block or explicit command/result pair, such as `Command: npm.cmd test ...` plus output/status;
- a structured finding that includes evidence/risk/verification fields and references existing repository files.

The guard should reject reports whose evidence is only circular, including statements equivalent to:

- this report exists;
- the task ran;
- the agent used tools;
- the report was committed;
- runtime mechanics were verified without inspecting project behavior.

The implementation should expose useful evidence fields in `TaskCompletionEvidenceResult.evidence`, such as:

- `substantiveReportEvidenceCount`;
- `circularReportEvidence`;
- `reportLineReferencedPaths`;
- `reportCommandEvidenceCount`.

### 2. Require Review-Stage Repository Tool Evidence For Risky Completion

Extend the completion guard to count latest review validation tool activity in `agentActivityLog`.

Review validation agents should include:

- `review-sidecar`;
- `security-sidecar`;
- `aif-review`;
- `aif-security-checklist`;
- `review-gate`.

For risky completion, require review-stage tool activity in addition to latest implementation-stage tool activity. This makes skip-review audit completion fail closed unless there is some repository-tool-backed review validation path.

This directly addresses the prior residual risk from `work-20260509-make-audit-pipeline-toolful`.

### 3. Fail Closed On Review-Gate Fallback For Risky Tasks

Change `packages/agent/src/reviewGate.ts` so fallback/parser acceptance cannot return `success` for risky audit/review/discovery tasks when structured review comments are absent or malformed.

Practical shape:

- Add risk context to `ReviewGateInput`, or pass a boolean such as `requiresSubstantiveReviewEvidence`.
- In `runLegacyFallbackExtraction`, do not allow a `SUCCESS` fallback result to approve risky tasks.
- In `buildFallbackDecision`, return `manual_review_required` or `request_changes` with a `review_gate` finding when fallback has no findings for a risky task.
- Keep existing behavior for non-risky tasks where legacy fallback can still be useful.

Because `reviewGate.ts` currently has no task title/description, the risk boolean can be computed by the coordinator or shared utility and passed in. The narrower alternative is to let `handleAutoReviewGate` pass enough task context for `reviewGate.ts` to evaluate risk with shared logic.

### 4. Tests

Focused tests should cover:

- weak committed report with an existing path but no line/symbol/command/substantive evidence is rejected;
- report whose only evidence is "this report exists" or "the task ran" is rejected;
- positive report with exact file line references and command output is accepted when implementation and review tool activity are present;
- risky committed report with no review-stage tool activity is rejected;
- review-gate malformed fallback `SUCCESS` does not accept risky tasks;
- non-risky fallback `SUCCESS` remains accepted;
- coordinator blocks an auto-review accepted audit task if review-stage tool activity is missing.

### 5. Live Validation After PLAN PASS

After code changes and local tests pass:

- retire or quarantine the old weak canary output/card from active validation surface;
- deploy the scoped change to server 67 using the existing project deployment path;
- run one negative quality canary that attempts a weak/generic report and verify it is reworked, blocked, or not marked done;
- run one positive quality canary that produces a committed report with concrete repository path/line/symbol or command-output evidence;
- record task ids, report paths, tool activity, block/rework evidence, and final accepted quality evidence in `result.md`.

## Open Questions

- The exact server-67 deployment commands and live task operations must be collected only after `PLAN PASS`.
- If live validation discovers the server schema/task payload does not preserve enough activity log context, the task should block or revise the design rather than synthesizing a pass.

## Acceptance Mapping

- Weak generic reports are rejected by `insufficient_report_evidence` and/or circular evidence detection.
- Reports must cite exact existing paths and practical line/function/symbol or command-output evidence.
- Circular evidence is rejected by explicit report quality checks.
- Auto-review fallback cannot approve risky audit output without substantive review evidence.
- Review/security sidecars or the review gate must use repository tools because risky completion requires review-stage `Tool:` activity.
- Positive live canary must pass both mechanical and substantive evidence gates.
