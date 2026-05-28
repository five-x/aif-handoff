# Plan: Unblock Direct Audit Canary Planner Routing

## Gate status

- `PLAN PASS`: passed by independent reviewer `Godel`.
- Implementation: authorized after `PLAN PASS`.
- Remote validation: blocked until `PLAN PASS` and local checks.
- Shared-memory recall: not used before `PLAN PASS`.

## Implementation plan

1. Direct audit artifact contract at task creation
   - Import `parseExpectedAuditReportArtifactPath` and `createRoadmapBatchContract` into `packages/api/src/routes/tasks.ts`.
   - After creating an accepted direct audit task, create a one-report artifact contract when the task has `taskIntent=audit` and a concrete expected report artifact path.
   - Use a deterministic alias such as `direct-audit-<task-id-prefix>` when no roadmap alias is supplied.
   - Add API tests proving direct audit task creation returns artifact trust with role `report`, expected state, and expected path.

2. Root-file audit boundary support
   - Update `packages/shared/src/planQuality.ts` so root-level file scopes parsed from `Scope:` count as concrete non-report audit boundaries.
   - Add plan-quality tests for `Scope: README.md` and `Report artifact: audit/direct-audit-positive-canary.md`.
   - Add negative tests for missing expected artifact, missing scope, source-fix plans, local AIF validation, and generic plans where coverage is not already present.

3. Deterministic direct audit plan shape
   - Extend `buildDeterministicDiagnosticPlan()` to include an explicit audit/report contract block.
   - Include expected artifact path, declared scope, allowed write paths, ledger/manifest/source-snapshot/committed-blob requirements, no source changes, and remote-only validation boundary.
   - Preserve existing synthesis and broad-audit decomposition behavior.

4. Implementer writer contract and routing verification
   - Ensure direct audit tasks with artifact rows reach `expectedAuditReportArtifactPath` in `packages/agent/src/subagents/implementer.ts`.
   - Add an explicit `auditWriterContract` block to the prompt for audit/report artifacts.
   - Add/update implementer tests proving `workflowKind=audit`, `profileMode=audit`, and `allowedWritePaths` are set for report artifacts.

5. Coordinator and artifact state
   - Rely on the existing roadmap artifact path for trusted completion and cleanup.
   - Add or update coordinator tests proving direct report artifacts use trusted mode, invalid reports are backed up/removed, and valid committed reports are preserved.

6. Documentation
   - Update `docs/ops/audit-trust-callsite-map-20260525.md` with direct audit canary routing and call-site path tables.
   - Update `docs/ops/external-audit-handoff-20260525.md` with the planner/routing follow-up section.
   - Fill `result.md` after implementation, tests, remote canaries, and independent gates.

7. Remote-only validation after local checks
   - Confirm remote health with `curl http://192.168.88.67/api/health`.
   - Deploy or otherwise run the changed service against remote target only.
   - Create a fresh negative canary that intentionally pressures fabricated/low-quality evidence and record terminal fail-closed evidence.
   - Create a fresh positive canary with a tiny stable scope and record trusted artifact lifecycle evidence.
   - Record final remote worktree cleanliness.

## Acceptance criteria

- Direct audit canaries no longer loop in plan-quality guard.
- Direct audit task creation yields `auditArtifactRole=report` and expected artifact path.
- Deterministic plan includes concrete scope, expected report artifact, allowed write paths, ledger, manifest, source snapshot, committed blob revalidation, no source changes, and remote-only boundary.
- Implementer routes report work as `workflowKind=audit` and `profileMode=audit`.
- Negative remote canary reaches report generation and fails closed with `trustedAuditArtifact=false`, `artifact_state_valid=false`, precise issue codes, cleanup backup path, and clean worktree.
- Positive remote canary reaches report generation and passes trusted artifact lifecycle with manifest, ledger, source snapshot, committed blob revalidation, and clean worktree.
- Runtime endpoint lease coverage remains passing.
- `docs/kb/windows-codex-bootstrap-validation.md` remains untouched and unstaged.

## Verification plan

Local targeted checks:

```powershell
npm.cmd test --workspace=@aif/shared -- planQuality auditReportValidator taskCompletionEvidence auditSynthesisClassifier
npm.cmd test --workspace=@aif/agent -- planner planChecker coordinator implementer reviewer reviewGate
npm.cmd test --workspace=@aif/runtime -- qwenLocalAgent
npm.cmd test --workspace=@aif/data -- index
```

Full local checks:

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd run build
git diff --check
```

Remote-only checks after local success:

```powershell
curl http://192.168.88.67/api/health
$env:AIF_SKIP_DEV_SERVER="1"
$env:AIF_WEB_URL="http://192.168.88.67"
$env:AIF_API_URL="http://192.168.88.67/api"
```

Independent gates:

- plan reviewer: explicit `PLAN PASS` or `PLAN FAIL`;
- tester: explicit `TEST PASS` or `TEST FAIL`;
- final reviewer: explicit `REVIEW PASS` or `REVIEW FAIL`.

## Stop conditions

- Stop if plan review returns `PLAN FAIL`; revise design/plan and rerun the gate.
- Stop if subagent gates are unavailable.
- Stop if any change would weaken audit validator, lifecycle, ledger-only completion, or fail-closed behavior.
- Stop if remote validation would target localhost/local AIF service.
- Stop if remote deployment/access prevents fresh canaries; record exact blocker instead of claiming DoD.
