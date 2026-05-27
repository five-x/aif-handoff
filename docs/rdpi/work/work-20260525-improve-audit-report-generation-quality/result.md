# Result: Raise Audit Report Generation Quality After Trust Boundary Hardening

Task ID: `work-20260525-improve-audit-report-generation-quality`

Date: 2026-05-25

## Outcome

Blocked after partial implementation.

Local source changes for generator evidence contracts, untrusted artifact cleanup, runtime bootstrap lease-store coverage, and call-site documentation were implemented and verified. The task is not Definition-of-Done complete because fresh remote negative and positive audit-quality canaries did not reach audit report generation. Both stopped in upstream planning quality replan loops before a report artifact could be produced and trusted.

## Local implementation completed

- Runtime tool audit evidence payloads now include `outputSha256`, bounded `outputPreview`, and `outputPreviewTruncated` so the report writer can cite exact ledger-backed evidence instead of reconstructing command output.
- Audit report writer prompts now include a hard allowed-evidence contract and machine-readable `allowedEvidence` JSON containing full `ev_*` IDs, tool names, scope IDs, risk IDs, command text, output hashes, and previews.
- The writer contract instructs audit/report tasks to choose `source_inconclusive` when scoped evidence is missing rather than expanding scope or inventing output.
- Coordinator terminal-block handling now backs up and removes untrusted untracked report artifacts, records `untrustedArtifactCleanup` details, and verifies artifact-path git status after cleanup.
- Runtime bootstrap tests now verify the qwen adapter receives the shared endpoint lease store from the registry path.
- Created `docs/ops/audit-trust-callsite-map-20260525.md`.
- After independent review, restored explicit remote validation-boundary guidance in `docs/ops/runbook.md`.
- After independent review, added cleanup safety coverage for staged report artifacts, backup failures, and trusted valid report preservation.

## Local verification passed

- `npm.cmd test --workspace=@aif/runtime -- qwenLocalAgent -t "emits bounded audit evidence"`
- `npm.cmd test --workspace=@aif/agent -- implementer -t "routes scoped config audit evidence repair"`
- `npm.cmd test --workspace=@aif/agent -- coordinator -t "backs up and removes untrusted"`
- `npm.cmd test --workspace=@aif/runtime -- bootstrap -t "injects the shared endpoint lease store"`
- `npm.cmd test --workspace=@aif/shared -- auditReportValidator taskCompletionEvidence auditSynthesisClassifier`
- `npm.cmd test --workspace=@aif/agent -- reviewer reviewGate coordinator implementer`
- `npm.cmd test --workspace=@aif/runtime -- qwenLocalAgent bootstrap`
- `npm.cmd test --workspace=@aif/data -- index`
- `npm.cmd run lint`
- `npm.cmd run build`
- `npm.cmd test`
- `git diff --check`
- `npm.cmd test --workspace=@aif/agent -- coordinator -t "audit artifacts|valid no-findings"`

## Remote validation evidence

Remote target:

```text
AIF_WEB_URL=http://192.168.88.67
AIF_API_URL=http://192.168.88.67/api
AIF_SKIP_DEV_SERVER=1
```

Remote health:

- `GET http://192.168.88.67/api/health` returned `{"status":"ok"}` after final restoration.
- `/opt/aif-handoff` was restored to clean commit `772ba2df08b5725decdbbeff15e7676fee6b1ba9` after temporary patched-build validation.
- `/srv/aif-handoff/projects/botIntevra` and `/srv/aif-handoff/projects/lwoio` ended with clean `git status --short --untracked-files=all`.

Temporary patched-build validation:

- Remote `/opt/aif-handoff` was fast-forwarded to `772ba2df08b5725decdbbeff15e7676fee6b1ba9`.
- Local source patch for this task was applied temporarily on the remote host.
- `docker compose up -d --build` completed and the API health check returned OK.
- The temporary patch was reverted after the remote canaries failed to reach report generation, and the remote service was rebuilt back to the clean source state.

Fresh negative canary:

- Task: `417342f5-3a96-4af7-8e05-22e8c643bf63`
- Project: remote LWO workspace
- Requested artifact: `audit/2026-05-25-negative-generation-quality-20260525232857.md`
- Terminal handling: task was paused after remaining in planning for approximately 18 minutes.
- Blocking evidence: `Plan quality guard replan 7/100`
- Planning issue codes included `placeholder_plan`, `missing_diagnostic_report_constraints`, `diagnostic_scope_violation`, `missing_audit_evidence_targets`, `missing_audit_exclusions`, `missing_audit_report_structure`, `audit_without_concrete_boundaries`, and `missing_child_audit_report_decision`.
- Artifact trust projection stayed blocked/untrusted. No trusted report artifact was produced.
- A generated plan left in the LWO worktree was recovered to `/srv/aif-handoff/backups/aif-worktree-cleanup/lwo-direct-negative-plan-recovered-20260525T2049Z/remote-negative-audit-generation-quality-canary-202605252328.md` and the worktree was returned clean.

Fresh positive canary:

- Task: `44c79a68-60ef-4465-a88c-a6bafbaf9e9b`
- Project: remote botIntevra workspace
- Requested artifact: `audit/2026-05-25-positive-generation-quality-20260525234935.md`
- Terminal handling: task was paused after remaining in planning for approximately 30 minutes.
- Blocking evidence: `Plan quality guard replan 9/100`
- Planning issue codes included `slash_fallback_echo`, `missing_audit_evidence_targets`, `missing_audit_exclusions`, `missing_audit_report_structure`, `audit_without_concrete_boundaries`, and `missing_child_audit_report_decision`.
- Artifact trust projection stayed blocked/untrusted. No trusted positive report artifact was produced.

Existing remote controls after patched-build attempt:

- Known negative control `cec8f23d-71a2-47dd-bb41-6dffb73b1ab4` remained fail-closed/untrusted with blocked/manual-review reason codes.
- Existing positive control `b3de6310-e1bc-4129-92e4-48a32554ed72` showed `artifactState=valid` but `artifactTrustLevel=untrusted` and `claimOutcome=not_evaluated`, so it does not satisfy the trusted positive canary acceptance criteria under the current rollout.

## Gates

- `PLAN PASS`: passed by independent plan reviewer `Jason`.
- `TEST FAIL`: independent tester `Ohm` confirmed local checks pass but remote canary acceptance criteria are unmet.
- `REVIEW FAIL`: independent reviewer `Newton` found local review issues; the runbook validation-boundary regression and cleanup safety-test gaps were revised locally.
- `TEST FAIL`: independent tester rerun `Carson` confirmed local review-fix checks pass but mandatory remote negative and positive canaries remain paused before report generation.
- `REVIEW PASS`: independent reviewer rerun `Tesla` found the local review-fix issues resolved and confirmed the blocked closeout is honest.

## Definition of Done status

Met locally:

- Source implementation completed.
- Unit and targeted package tests passed.
- Full `npm.cmd test`, lint, build, and diff checks passed.
- Call-site map created.
- External handoff updated with the current blocked state.

Not met:

- Fresh remote negative generator canary did not complete to the expected fail-closed audit-report validation path.
- Fresh remote positive generator canary did not produce a trusted artifact.
- Remote trusted synthesis acceptance was not proven.
- Independent `TEST PASS` is not recorded.

## Required follow-up

The remaining blocker is upstream audit planner/routing quality for direct audit report canary tasks, plus a fresh roadmap-backed positive trusted canary after the planner can reliably produce child report work. The trust promotion boundary remains fail-closed, and the generator-quality controls added here are locally verified, but the requested remote Definition of Done is not complete.
