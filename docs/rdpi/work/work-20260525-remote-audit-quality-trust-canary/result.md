# Result: Remote Audit Quality Trust Canary

## Outcome

Primary classification: **audit quality fixed**.

The remote trust-quality canary demonstrates that weak, malformed, or fabricated audit evidence fails closed instead of becoming trusted synthesis input. The deployed service returns machine-readable blocked state, trust level, reason codes, failure signatures, batch counts, and next action for negative audit attempts. The same deployed service also has a trusted positive control with ledger-backed, committed report and synthesis artifacts.

No local AIF service, browser, or e2e checks were run for this result.

## Remote Guard

- Target API: `http://192.168.88.67/api`.
- Guard result: passed.
- Guarded host: exactly `192.168.88.67`.
- Remote health: `GET /api/health` returned `{status:"ok", uptime:253735}`.
- Remote projects:
  - botIntevra: `e4a3a101-ec7f-4f93-9b68-e297ffe8952f`, root `/home/www/botIntevra`.
  - LWO: `39a8cd6b-91a3-4fa7-99f9-f1830e4fcb67`, root `/home/www/lwoio`.

## Negative Evidence

Predecessor failed canary `866c5874-6f42-412b-a8a6-45adb1c5b728` on botIntevra reached `blocked_external`.

- Trust rollup: `artifactRole=implementation_manifest`, `artifactState=blocked`, `artifactTrustLevel=untrusted`, `claimOutcome=blocked`, `failureFamily=external_blocker`.
- Reason codes: `[blocked,manual_review_required]`.
- Synthesis flags: `trustedSynthesisInput=false`, `synthesisReady=false`.
- Next action: `provide_operator_input`.
- Failure signature: `task_record:implementation_manifest:blocked:manual_review_required`.
- Batch counts: `{trustedValid:0,inconclusive:0,rejected:5,missing:0,externalBlocked:1,synthesisPending:0,total:6}`.
- Blocked reason included uncommitted report artifact, invalid or missing file references, invalid report manifest, low quality report evidence, manual review required, malformed structured review contract, and closure blocker IDs including `invalid_report_manifest`, `invalid_line_reference`, and `missing_substantive_evidence`.

Fresh botIntevra negative attempt `5fd1ace1-ba50-4bc0-b604-56e65c7ca59d` was blocked before implementation by branch isolation:

> Branch isolation failure (dirty_worktree): Working tree at /home/www/botIntevra has uncommitted changes (?? audit/). Commit, stash, or discard them before continuing.

- Trust rollup: `artifactState=blocked`, `artifactTrustLevel=untrusted`, `claimOutcome=blocked`, `failureFamily=external_blocker`.
- Reason codes: `[blocked]`.
- Synthesis flag: `trustedSynthesisInput=false`.
- Next action: `provide_operator_input`.
- Failure signature: `task_record:implementation_manifest:blocked`.

Fresh LWO negative canary `cec8f23d-71a2-47dd-bb41-6dffb73b1ab4` was created through remote `POST /tasks`, auto-started, and reached terminal `blocked_external`.

- Branch: `feature/remote-audit-quality-negative-trust-cana-cec8f2`.
- Worktree: `/home/www/lwoio-feature-remote-audit-quality-negative-trust-cana-cec8f2-cec8f23d-71a2-47dd-bb41-6dffb73b1ab4`.
- Artifact written and validated: `audit/2026-05-25-remote-quality-negative-canary.md`.
- Trust rollup: `artifactRole=implementation_manifest`, `artifactState=blocked`, `artifactTrustLevel=untrusted`, `claimOutcome=blocked`, `failureFamily=external_blocker`.
- Reason codes: `[blocked,manual_review_required]`.
- Latest attempt outcome: `blocked`.
- Synthesis flags: `trustedSynthesisInput=false`, `synthesisReady=false`.
- Next action: `provide_operator_input`.
- Failure signature: `task_record:implementation_manifest:blocked:manual_review_required`.
- Batch counts: `{trustedValid:0,inconclusive:0,rejected:5,missing:0,externalBlocked:1,synthesisPending:0,total:6}`.
- Top-level issue codes: `uncommitted_report_artifact`, `invalid_or_missing_file_references`, `invalid_report_manifest`, `low_quality_report_evidence`, `manual_review_required`.
- Review and validator blocker IDs: `[c1fa285bc2a8] structured-review-contract`, `[b58c8bdd7472] invalid_report_manifest`, `[bff8bcad31d9] missing_risk_hypotheses`, `[44a083690ac6] fake_or_placeholder_command_output`, `[909710115695] contradictory_findings_and_no_findings`, `[0d85c71369a0] missing_report_file_references`.
- It never produced trusted `validated_no_findings`.

## Positive Evidence

Positive trusted control: existing remote roadmap batch `auditstrong20260522oom22`.

Report task `b3de6310-e1bc-4129-92e4-48a32554ed72`:

- Status: `done`.
- Artifact role: `report`.
- Artifact state: `valid`.
- Artifact trust level: `trusted`.
- Claim outcome: `supported`.
- Reason codes: `[accepted,file,valid,validated_no_findings]`.
- Synthesis flags: `trustedSynthesisInput=true`, `synthesisReady=true`.
- Next action: `none`.
- Failure signature: `role:report|classification:validated_no_findings`.
- Artifact path: `audit/2026-05-21-audit-architecture-and-ownership-boundaries-audit.md`.
- Batch counts: all 6 trusted, 0 rejected.
- Timeline validation: `ok=true`, no issues.
- Artifact SHA-256: `76cc7653fbfb677cb5fb91e5d217690f7d1ef95d5328ee72ff73923f9f18148f`.
- Content SHA-256: `3e5affa6c2b222ffeb324942e7cd8b884ef24ec5b743e3b9457c3e4be0fc80e6`.
- Source snapshot: `git:8d704e03e41bfd49942501207d15691e705086c2:c40ef496045cf6d00b6d9f689a500cce3557ff5f`.
- Commit: `8d704e03e41bfd49942501207d15691e705086c2`.
- Tree: `c40ef496045cf6d00b6d9f689a500cce3557ff5f`.
- Branch: `feature/audit-architecture-and-ownership-boundar-b3de63`.
- Dirty state: `false`.
- Committed report required: `true`.
- Committed changed files: only the audit artifact.
- Uncommitted report artifact files: empty.
- Substantive report evidence: `true`.
- Report quality issues: empty.
- Evidence count: 39 total, 37 substantive.

Synthesis task `6fdb8e1f-ec0d-4204-970d-8f2ff35929ca`:

- Status: `done`.
- Artifact role: `synthesis`.
- Artifact state: `valid`.
- Artifact trust level: `trusted`.
- Claim outcome: `supported`.
- Reason codes included `validated_no_findings`.
- Synthesis flags: `trustedSynthesisInput=true`, `synthesisReady=true`.
- Next action: `none`.
- Artifact path: `audit/2026-05-21-summary.md`.
- Batch counts: 6 trusted valid.

## Follow-Up

Operational follow-up is required for botIntevra because fresh canary attempts are blocked by a dirty worktree at `/home/www/botIntevra` with uncommitted `audit/` changes. The remote service correctly reports this as branch isolation failure and blocks the attempt, but the dirty worktree prevents a clean fresh botIntevra negative canary from running.

Queued follow-up intake card: `docs/intake/work/work-20260525-clear-remote-botintevra-dirty-audit-worktree.md`. This parent diagnostic task did not execute that follow-up.

## Gate Notes

- Scope was limited to recording the remote-only canary evidence and queueing the follow-up intake artifact.
- Source code was not edited.
- No local AIF service, local browser, or local e2e verification was run.
- The result relies on remote evidence collected after `PLAN PASS` for the guard, health, negative canaries, and trusted positive control.
- Independent tester gate returned `TEST PASS`.
- Independent final reviewer gate returned `REVIEW PASS`.
