# Design: Raise Audit Report Generation Quality After Trust Boundary Hardening

## Design goals

- Keep existing trust gates strict and fail-closed.
- Improve first-pass audit report quality by making the writer contract source-led, scope-bound, and ledger-backed.
- Ensure invalid/blocked diagnostic audit runs do not leave dirty untrusted report artifacts behind.
- Prove both negative rejection and positive trusted generation through remote-only canaries.
- Preserve typed issue codes and actionable next steps for operators.

## Non-goals

- Do not weaken report validation, lifecycle verification, ledger-only completion, trusted synthesis, or review gates.
- Do not run or validate against a local AIF service.
- Do not fix botIntevra business logic or turn audit findings into implementation work.
- Do not change public outcome vocabulary without a separate task.

## Core approach

The implementation should treat audit report production as a constrained artifact-building workflow:

1. Parse and normalize declared scope roots from the task description.
2. Gather or reuse ledger evidence that maps to those exact roots and risk hypotheses.
3. Provide the writer a machine-readable allowed evidence/citation table.
4. Write report sections from that table only.
5. Finalize/validate/commit the artifact only if it is trusted-valid.
6. If evidence is insufficient, produce an honest `source_inconclusive` record with exact missing evidence and next action.
7. If a run terminalizes blocked or inconclusive with an untrusted/uncommitted artifact, backup and remove it from the worktree, then record cleanup details.

## Work package design

### 1. Scope discipline

Add a shared helper or consolidate the current implementer-local parser so declared audit scope roots are normalized consistently across:

- report prompt construction,
- deterministic repair,
- validator context,
- tests and canary scripts.

The writer should receive a compact scope contract:

```json
{
  "declaredScopeRoots": ["README.md"],
  "allowedReportArtifactPath": "audit/example.md",
  "outOfScopePolicy": "do_not_expand_without_source_inconclusive"
}
```

The post-generation self-check should require:

- every declared root appears in manifest `scopeCoverage`;
- every declared root has at least one body citation to a real line under that root;
- body citations used for findings/no-findings are backed by ledger IDs whose `scopeIds` overlap the declared root;
- report body and manifest do not promote unscoped files to evidence.

If the current validator can only emit `missing_scope_coverage`, keep that behavior but add `scope_drift` only if it gives a materially clearer reason for out-of-scope evidence replacing declared scope. Do not add a new code unless tests and operator messages benefit from the distinction.

### 2. Ledger-backed writer inputs

The writer prompt already includes ledger IDs and previews. Improve this into an explicit allowed citation list:

```json
{
  "allowedEvidence": [
    {
      "id": "ev_...",
      "tool": "read_file",
      "scopeIds": ["README.md"],
      "riskIds": ["risk-readme-1"],
      "path": "README.md",
      "lineRanges": ["README.md:2"],
      "command": "read_file README.md",
      "outputPreview": "[read_file README.md lines 1-2 of 2] ...",
      "outputSha256": "..."
    }
  ]
}
```

Generation rule: the report may cite only `allowedEvidence` IDs. Command output prose must be copied or summarized from the allowed preview/hash metadata. If the needed evidence is absent, the writer must choose `source_inconclusive`.

The qwen tool result already includes audit evidence metadata for model-visible tool calls. If the model still lacks enough path/range detail, extend that payload to include safe line/path summary and output hash, while keeping secrets redacted.

### 3. Deterministic report scaffold

Introduce a deterministic report skeleton for audit/report tasks, used either directly by deterministic repair or injected into the writer prompt:

- Title and scope summary.
- Evidence Register: `Evidence ID | Scope | Risk | Citation | Tool/command | Output preview/hash`.
- Scope Coverage: one row per declared root.
- Findings: only validated findings with `Evidence`, `Risk`, `Proposed fix`, and `Verification`.
- No Findings Claims: one scoped rationale per covered risk/root.
- Inconclusive Gaps: exact missing roots/evidence.
- Manifest: generated/finalized through the existing tool.

This keeps the model filling slots rather than inventing report structure. It also gives tests stable assertions for positive quality.

### 4. Dirty artifact cleanup

Add a cleanup helper in the agent layer because cleanup is operational workflow, not shared validation:

```ts
cleanupUntrustedAuditArtifactAfterTerminalRun({
  projectRoot,
  task,
  artifactPath,
  validation,
  lifecycle,
  terminalStatus,
  backupRoot,
});
```

Rules:

- Run only for audit/report artifacts that are untrusted and terminalized as `blocked_external`, `source_inconclusive`, or manual-review-required blocked states.
- Do not run for trusted committed valid artifacts.
- Do not delete without backup.
- Backup outside the git worktree, with timestamp/task/artifact naming and sha256.
- Remove only the untrusted artifact path and any now-empty parent `audit/` directory if it is untracked/empty.
- Verify `git status --short --untracked-files=all -- <artifactPath>` is clean.
- Record `untrustedArtifactCleanup` in validation details and/or task activity:

```json
{
  "artifactPath": "audit/report.md",
  "backupPath": "/.../audit-report-cleanup/task-id/report.md.tar.gz",
  "cleanupStatus": "backed_up_and_removed",
  "gitStatusAfterCleanup": "clean"
}
```

Use a configured backup root if available. If no repo-level config exists, add a small explicit env/config option such as `AIF_AUDIT_ARTIFACT_BACKUP_DIR`, with a safe default outside `projectRoot` for tests.

### 5. Production call-site guard

Create `docs/ops/audit-trust-callsite-map-20260525.md` during implementation. It should map source generation, validation, completion evidence, artifact-state update, synthesis input build, synthesis validation, review gate, and API/timeline display.

Implementation should add targeted assertions/tests that:

- production audit/report/synthesis completion paths enter trusted mode;
- `updateRoadmapBatchArtifactState({ state: "valid" })` is reached only with trusted artifact proof or equivalent lifecycle-valid validation details;
- diagnostic mode is allowed only for non-trusted previews/tests/operator tooling;
- production synthesis does not trust raw `reports`.

### 6. Legacy synthesis guard

The classifier already treats legacy raw `reports` as blockers. Production paths should log or annotate when raw reports appear in a production synthesis context, and tests should prove raw strong prose cannot yield trusted `validated_no_findings`.

Prefer typed `TrustedSourceAuditArtifact[]` built from roadmap artifact DB state plus validation details and committed blob proof.

### 7. Structured review routing verification

No major redesign is expected. Add or confirm tests for:

- missing Security Coverage row -> typed parse issue -> request changes with repair instructions;
- PASS with blockers -> typed parse issue -> request changes;
- specialized `INCONCLUSIVE` -> typed parse/manual path according to current policy;
- repeated same fingerprint -> manual review;
- comments preserve issue codes and fingerprint.

### 8. Runtime endpoint lease verification

No major redesign is expected. Confirm and test:

- API, agent, and subagent paths inject DB-backed lease stores;
- holder IDs are distinct;
- 8003 and 8005 endpoint keys and cooldowns are distinct;
- queue timeout does not set cooldown;
- transport/timeout sets shared cooldown;
- stale lease recovers.

Remote log inspection belongs after `PLAN PASS`.

## Data and compatibility

- Do not change the report outcome vocabulary.
- Existing validation details should remain backward compatible. New cleanup details should be additive.
- New reason codes should be added only when they improve actionability and are mapped through roadmap failure families.
- Tests should avoid relying on current unrelated dirty docs.

## Verification design

Local verification after implementation:

- Targeted shared tests for validator, completion evidence, and synthesis classifier.
- Targeted agent tests for implementer/coordinator/review gate.
- Targeted runtime/data tests for qwen-local-agent endpoint leases and DB lease store.
- `npm.cmd test`, `npm.cmd run lint`, `npm.cmd run build`, `git diff --check`.

Remote verification after local tests:

- Use only `AIF_WEB_URL=http://192.168.88.67`, `AIF_API_URL=http://192.168.88.67/api`, `AIF_SKIP_DEV_SERVER=1`.
- Health check.
- Fresh negative audit-quality canary.
- Fresh positive audit-quality canary.
- Runtime endpoint lease canary/log confirmation.
- Remote botIntevra worktree clean confirmation.

## Risks

- This task is broad. Keep edits focused on production-quality paths and tests rather than rewriting the entire audit pipeline.
- Cleanup code must not remove user/source files. It must target declared report artifacts only and require backup verification.
- Positive canary may expose model-quality issues that cannot be fully solved with deterministic scaffolding in one pass. If that happens, close only with honest residual notes after fail-closed behavior and cleanup are proven.
