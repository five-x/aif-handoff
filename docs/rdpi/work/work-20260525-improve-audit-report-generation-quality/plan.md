# Plan: Raise Audit Report Generation Quality After Trust Boundary Hardening

## Gate status

- `PLAN PASS`: received from independent reviewer `Jason`.
- Implementation: authorized after `PLAN PASS`.
- Live/remote validation: authorized after `PLAN PASS`.
- Shared-memory recall: not used before `PLAN PASS`.

## Implementation plan after `PLAN PASS`

1. Audit generation scope and evidence contract
   - Consolidate or expose declared scope parsing where it can be reused by prompt, deterministic repair, and tests.
   - Add a compact machine-readable scope/evidence contract to the audit report writer prompt.
   - Add an allowed evidence list with exact `ev_*` IDs, scope IDs, risk IDs, tool/command metadata, output preview/hash, and safe path/line summaries.
   - Ensure the writer instructions prefer `source_inconclusive` over silent scope expansion when evidence is insufficient.

2. Deterministic report scaffold and self-check
   - Add a stable report skeleton or generation helper for audit/report tasks: Evidence Register, Scope Coverage, Findings, No Findings Claims, Inconclusive Gaps, Manifest.
   - Update deterministic repair to populate the skeleton from scoped ledger evidence.
   - Keep manifest finalization and validation through existing tools.
   - Add or refine reason-code guidance for scope drift if existing `missing_scope_coverage` is not actionable enough.

3. Cleanup untrusted terminal artifacts
   - Add an agent-layer cleanup helper for untrusted/uncommitted audit artifacts after terminal blocked/manual/inconclusive runs.
   - Backup the artifact outside the worktree before removal.
   - Remove only the declared untrusted report artifact and empty untracked report directory when safe.
   - Verify artifact path git status is clean.
   - Persist `untrustedArtifactCleanup` details in validation details and task activity.
   - Do not clean trusted committed valid artifacts.

4. Production call-site audit and guard
   - Create `docs/ops/audit-trust-callsite-map-20260525.md`.
   - Map all call sites for `evaluateTaskCompletionEvidence`, `validateAuditReportArtifact`, `verifyAuditArtifactLifecycle`, `classifyAuditSynthesisSourceReports`, and `updateRoadmapBatchArtifactState`.
   - Add runtime assertions or tests proving production audit/report/synthesis paths use trusted artifact mode when they can update roadmap artifact state.
   - Confirm `state: "valid"` updates are downstream of trusted artifact proof/lifecycle-valid validation details.

5. Synthesis and review routing verification
   - Confirm production synthesis builds typed trusted source artifacts from DB artifact state, validation details, and committed proof.
   - Add/confirm tests that raw legacy `reports` cannot synthesize trusted no-findings.
   - Add/confirm structured review routing tests for first malformed output -> rework and repeated same fingerprint -> manual review.

6. Runtime lease verification
   - Add/confirm runtime/data tests for two adapter instances contending for one endpoint, heartbeat renewal, stale lease recovery, queue timeout without cooldown, transport/timeout with cooldown, and distinct 8003/8005 endpoint keys.
   - Confirm bootstrap tests cover API/agent/subagent lease-store injection where feasible without live service probing.

7. Remote canary suite and docs
   - Add or update scripts/docs for remote-only positive and negative canaries.
   - Run remote-only health, negative canary, positive canary, runtime endpoint lease canary/log check, and botIntevra clean worktree check.
   - Update `docs/ops/external-audit-handoff-20260525.md` with final results and exact remaining caveats.

## Tests to add or update

- `packages/shared/src/__tests__/auditReportValidator.test.ts`
  - README-only scope with report citing only `src/config.ts` fails with scope coverage/drift code.
  - README-only scope with insufficient evidence becomes `source_inconclusive` rather than fabricated no-findings.
  - Fake command output remains blocked with exact issue codes.

- `packages/shared/src/__tests__/taskCompletionEvidence.test.ts`
  - Trusted mode cannot pass without ledger evidence.
  - Direct audit/report task cannot pass in diagnostic mode by accident when it has production role/batch context.
  - Cleanup details do not count as trusted artifact proof.

- `packages/shared/src/__tests__/auditSynthesisClassifier.test.ts`
  - Raw strong prose in legacy `reports` returns `source_inconclusive`.
  - Typed trusted source artifact can produce trusted synthesis.

- `packages/agent/src/__tests__/implementer.test.ts`
  - Writer prompt includes declared scope contract and allowed evidence list.
  - Audit generator/repair with README-only scope does not substitute tests/config.
  - Existing ledger evidence can produce a scoped positive no-findings report skeleton.
  - Insufficient scoped evidence terminalizes `source_inconclusive` with missing evidence details.

- `packages/agent/src/__tests__/coordinator.test.ts`
  - Invalid uncommitted report is backed up, removed, and leaves artifact path clean.
  - Backup path is recorded in validation details/activity.
  - Valid committed report is not removed.

- `packages/agent/src/__tests__/reviewContract.test.ts` and `packages/agent/src/__tests__/reviewGate.test.ts`
  - Missing Security Coverage, PASS-with-blockers, specialized INCONCLUSIVE policy, repeated fingerprint manual block, and preserved issue codes/fingerprint.

- `packages/runtime/src/__tests__/qwenLocalAgent.test.ts` and `packages/data/src/__tests__/index.test.ts`
  - Shared lease contention, heartbeat renewal, stale lease recovery, queue timeout without cooldown, transport/timeout cooldown, separate endpoint keys.

## Local verification commands

Run after implementation:

```powershell
npm.cmd test --workspace=@aif/shared -- auditReportValidator taskCompletionEvidence auditSynthesisClassifier
npm.cmd test --workspace=@aif/agent -- reviewContract reviewGate coordinator implementer
npm.cmd test --workspace=@aif/runtime -- qwenLocalAgent
npm.cmd test --workspace=@aif/data -- index
npm.cmd test
npm.cmd run lint
npm.cmd run build
git diff --check
```

If the root format gate is still affected by unrelated baseline drift, use direct Prettier checks for touched files and document the root-gate limitation.

## Remote validation plan

Run only after local verification and only against `192.168.88.67`:

```powershell
$env:AIF_SKIP_DEV_SERVER="1"
$env:AIF_WEB_URL="http://192.168.88.67"
$env:AIF_API_URL="http://192.168.88.67/api"
```

Checks:

- `GET http://192.168.88.67/api/health`.
- Fresh negative audit-quality canary: expect `blocked_external`, `manualReviewRequired=true`, trusted artifact false, precise issue codes, and clean worktree after cleanup.
- Fresh positive audit-quality canary: expect trusted artifact true, lifecycle `artifact_state_valid`, committed blob revalidated, trusted report/synthesis if applicable, and clean worktree.
- Runtime endpoint lease canary/log check: expect one active lease per endpoint, holder IDs, wait/acquire/heartbeat/release logs, no queue timeout storm, separate 8003/8005 cooldowns.
- botIntevra container worktree: `git status --short --untracked-files=all` clean.

## Documentation outputs

- Update `docs/ops/external-audit-handoff-20260525.md`.
- Create `docs/ops/audit-trust-callsite-map-20260525.md`.
- Complete `docs/rdpi/work/work-20260525-improve-audit-report-generation-quality/result.md` only after `PLAN PASS`, `TEST PASS`, and `REVIEW PASS`.

## Stop conditions

- Stop if independent plan review returns `PLAN FAIL`; revise `design.md`/`plan.md` and rerun the gate.
- Stop if required subagent gates are unavailable; mark blocked instead of self-certifying.
- Stop if cleanup would remove anything outside the declared untrusted report artifact path.
- Stop if remote validation would target localhost/local AIF service.
