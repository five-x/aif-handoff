# Result: Unblock Direct Audit Canary Planner Routing

## Outcome summary

Direct audit canary planner/routing is unblocked for fresh remote canaries on `http://192.168.88.67/api`.

- Negative remote canary `0edf9524-d26a-41a3-85b4-0484f89ecfd6` reached report generation and failed closed as `source_inconclusive`.
- Positive remote canary `5d4c787d-eedd-45c6-883a-440a5d54dbe8` reached report generation, produced a trusted audit report, committed only the report artifact, revalidated the committed blob, and ended `done`.
- Remote project worktree `/srv/aif-handoff/projects/botIntevra` ended clean on branch `feature/positive-trusted-direct-audit-canary-202-5d4c78`.
- Local pre-existing dirty file `docs/kb/windows-codex-bootstrap-validation.md` remained excluded.

Remaining audit work is report-depth consistency across broader scopes, not the direct-canary trust proof path.

## Planning Quality Failure Root Cause

- Remote task ID: prior blocked negative `417342f5-3a96-4af7-8e05-22e8c643bf63`; prior blocked positive `44c79a68-60ef-4465-a88c-a6bafbaf9e9b`; fixed proof task `5d4c787d-eedd-45c6-883a-440a5d54dbe8`.
- Project: `botIntevra`, project ID `e4a3a101-ec7f-4f93-9b68-e297ffe8952f`.
- Stage: planning/plan-checker before report generation.
- Blocked reason: free-form plans drifted into generic implementation or slash-command fallback text and never produced an accepted direct audit/report contract.
- Plan quality issue codes:
  - Negative blocked task: `placeholder_plan`, `missing_diagnostic_report_constraints`, `diagnostic_scope_violation`, `missing_audit_evidence_targets`, `missing_audit_exclusions`, `missing_audit_report_structure`, `audit_without_concrete_boundaries`, `missing_child_audit_report_decision`.
  - Positive blocked task: `slash_fallback_echo`, `missing_audit_evidence_targets`, `missing_audit_exclusions`, `missing_audit_report_structure`, `audit_without_concrete_boundaries`, `missing_child_audit_report_decision`.
- Raw plan excerpt: the negative blocked plan said it would write a report for `README.md` but also included fake evidence pressure markers, source-inconclusive claims, git add/commit instructions, and a manifest whose `scope` was the report path rather than the source scope. The positive blocked plan started with a tool limitation narrative and slash-command fallback text instead of a concrete diagnostic plan.
- Expected plan shape: `intent=audit`, diagnostic-only, declared source scope `README.md`, expected artifact `audit/<canary>.md`, allowed write path limited to that artifact, explicit no-source-changes constraint, ledger/manifest/source-snapshot/committed-blob requirements, local AIF forbidden, and remote target `192.168.88.67`.
- Actual plan shape: generic prose that did not preserve source boundaries, did not reliably set the report artifact role/allowed writes, and sometimes treated the report artifact itself as the audited scope.
- Root cause: direct audit tasks were created without an explicit report artifact contract and could fall through to free-form planning. The plan checker also rejected root-level source scopes like `README.md`, and direct canary review was still allowed to fan out to unrelated specialized reviewers after deterministic audit validation passed.
- Fix:
  - API task creation now rejects direct audit tasks without a concrete `Report artifact:` path and creates a one-report roadmap artifact contract with role `report`.
  - API task updates now apply the same direct audit contract when an existing task is converted to or remains `taskIntent=audit`; missing report artifacts are rejected, conflicting report contracts fail closed, and contract creation failures roll back the persisted task update.
  - Planner/plan-checker now accepts a deterministic diagnostic audit plan for direct canaries, including root-level source files, local-AIF-forbidden checks, declared scope, report artifact, and allowed writes.
  - Implementer prompts now include a structured audit writer contract with allowed evidence refs, declared scope roots, expected artifact path, trust requirements, and forbidden fabricated evidence/local validation/source edits.
  - Risk parsing was tightened so instruction text and generic lowercase words do not become fake risk queries.
  - Direct canary report review now uses deterministic audit report validation rather than unrelated specialized reviewer fanout.

Post-fix plan excerpt from task `5d4c787d-eedd-45c6-883a-440a5d54dbe8`:

```text
## Diagnostic-only plan
intent: audit
scope: README.md
expectedArtifacts: audit/direct-audit-positive-trusted-canary-20260527-v2.md
allowedChanges: report
forbiddenChanges: source, tests, docs, config, secrets
Contract:
- Task intent: audit
- Diagnostic only: yes
- Expected report artifact: audit/direct-audit-positive-trusted-canary-20260527-v2.md
- Declared scope: README.md
- Allowed write paths: audit/direct-audit-positive-trusted-canary-20260527-v2.md
- Ledger evidence required: yes
- Manifest required: yes
- Source snapshot required: yes
- Committed blob revalidation required: yes
- Local AIF service/e2e: forbidden
- Remote validation target: http://192.168.88.67/api
```

## Negative Remote Canary Evidence

- Remote target: `http://192.168.88.67/api`
- Task ID: `0edf9524-d26a-41a3-85b4-0484f89ecfd6`
- Project ID: `e4a3a101-ec7f-4f93-9b68-e297ffe8952f`
- Roadmap batch ID: `f7e53f46-8963-49b7-9ffa-2eb419c7a355`
- Report artifact path: `audit/direct-audit-negative-canary-20260527.md`
- Final status: `blocked_external`
- Blocked reason: `source_inconclusive: audit report audit/direct-audit-negative-canary-20260527.md is terminal non-trusted: validator issue codes: irrelevant_grep_match, manifest_outcome_mismatch, shallow_evidence`
- Issue codes: `irrelevant_grep_match`, `manifest_outcome_mismatch`, `shallow_evidence`, `source_inconclusive`, `terminal_inconclusive`, `untrusted_artifact`
- Validation fingerprint: `885af8ebf66c7024`
- Lifecycle states: not valid or trusted; artifact row state `source_inconclusive`, UI state `inconclusive`, claim outcome `inconclusive`, claim trust level `untrusted`
- trustedAuditArtifact: `false` for trusted proof purposes; no trusted artifact proof was persisted and the claim trust level was `untrusted`
- Manifest status: `invalid`
- Source classification: `source_inconclusive`
- Artifact SHA-256: `877bf0eb9f457508c4e60af26a2ee937e041faa74be37fdb757ed3d0cdba59b6`
- Content SHA-256: `d3baf7c2311ee09aa437596d2a5b73fbe6bfef7db8ba17b950e3525b0b4a24bc`
- Cleanup backup path: not applicable for this run because the invalid report was committed on its isolated feature branch before terminal validation; no untracked dirty report remained to back up.
- Final git status: remote project branch was later advanced by the positive canary and ended clean, with `git status --short --branch --untracked-files=all` returning only `## feature/positive-trusted-direct-audit-canary-202-5d4c78`.

## Positive Remote Canary Evidence

- Remote target: `http://192.168.88.67/api`
- Task ID: `5d4c787d-eedd-45c6-883a-440a5d54dbe8`
- Project ID: `e4a3a101-ec7f-4f93-9b68-e297ffe8952f`
- Roadmap batch ID: `f787d7bf-a1c0-484d-ab27-36061feba68f`
- Report artifact path: `audit/direct-audit-positive-trusted-canary-20260527-v2.md`
- Final status: `done`
- Source classification: `validated_no_findings`
- Ledger evidence IDs: `ev_0d3b449c-fee9-492e-9a5b-977f1bcb274c`, `ev_0f352b50-d9e4-4f8f-8069-a0efca061f64`
- Manifest status: `valid`
- Validation fingerprint: `df165cb52bbe70b2`
- Lifecycle states: `draft_written=true`, `manifest_finalized=true`, `validator_passed=true`, `git_committed=true`, `committed_blob_revalidated=true`, `artifact_state_valid=true`
- trustedAuditArtifact: `true`
- trustedSynthesisInput: `true`
- synthesisReady: `true`
- committed artifact SHA: `f10866dc1034eac4bcfdf0879f3ad5c592a28fd47ceebaf5b2d1f9f306a0b1dd`
- committed content SHA: `71ac6249746c10b88a94279f33abba99d8df5bf9ad48a906d42ecfc008a58ebb`
- Completion evidence result: `accepted`, claim outcome `supported`, reason codes `accepted`, `file`, `valid`, `validated_no_findings`
- Committed report commit: `b0aeaa2 Audit: repair report evidence`
- Committed report files: only `audit/direct-audit-positive-trusted-canary-20260527-v2.md`
- Final git status: `## feature/positive-trusted-direct-audit-canary-202-5d4c78` and no dirty/untracked entries.

## Runtime and remote validation evidence

- Remote health: `GET http://192.168.88.67/api/health` returned `{"status":"ok"}` after the remote service rebuild.
- Remote validation used `AIF_WEB_URL=http://192.168.88.67`, `AIF_API_URL=http://192.168.88.67/api`, and `AIF_SKIP_DEV_SERVER=1`; no localhost/local AIF validation was used as final proof.
- Runtime lease bootstrap remained covered by local regression tests for `@aif/runtime` and `@aif/data`; the changed direct-canary path did not weaken endpoint lease behavior.

## Gate verdicts

- Plan review: `PLAN PASS` from independent reviewer `Godel`.
- Local full gates: `npm.cmd test`, `npm.cmd run lint`, `npm.cmd run build`, and `git diff --check` passed after the final review-finding fixes.
- Targeted local gates: `@aif/shared` `planQuality`, `@aif/api` `tasks`, and `@aif/agent` `planner`/`planChecker`/`implementer`/`reviewer` passed after the final review-finding fixes.
- Test gate: `TEST PASS` from independent tester `Nash` after the final API rollback fix.
- Final review: `REVIEW PASS` from independent reviewer `Hubble` after confirming `docs/kb/windows-codex-bootstrap-validation.md` is pre-existing, unstaged, and excluded.
- User waivers: none.

## Stable facts

- Direct audit task creation must require a concrete `Report artifact:` path before it can enter trusted-artifact routing.
- Updating an existing task into audit intent must enforce the same report-artifact contract as task creation and must roll back if contract creation fails.
- Direct audit canary planning should use deterministic diagnostic plan construction instead of model-generated planning prose.
- Root-level source scopes such as `README.md` are valid audit boundaries when the report path is separate and allowed writes are limited to the report.
- Direct canary review should trust deterministic audit validator/lifecycle outcomes and should not fail a valid report because unrelated specialized reviewers time out.

## Reusable patterns

- For narrow trust canaries, bind the source scope, expected artifact path, allowed write path, remote target, and trusted-artifact lifecycle into the plan before any model prompt runs.
- Treat invalid but committed canary reports as isolated branch evidence; cleanup backup applies to untrusted untracked or dirty artifacts that would otherwise pollute the project worktree.
