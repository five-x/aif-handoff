# External Audit Handoff: AIF Audit Trust Hardening

Date: 2026-05-25

## Scope Completed

This change set addresses the external review concerns around weak audit evidence, trusted artifact boundaries, synthesis trust propagation, structured reviewer errors, validation retry loops, runtime endpoint saturation, and remote-only audit quality validation.

Implemented areas:

- Trusted audit artifact lifecycle: an audit report becomes trusted only after manifest finalization, ledger binding, source snapshot binding, validation, clean committed path state, committed blob validation, and content/hash consistency.
- Ledger-only completion evidence for audit tasks: trusted audit completion now depends on structured ledger/artifact evidence rather than text-only logs.
- Trusted source synthesis: synthesis must consume trusted source artifacts; missing, rejected, untrusted, or invalid source reports block trusted no-findings synthesis.
- Typed structured review errors: parser and gate failures now surface typed reason codes/fingerprints instead of generic review text.
- Audit validation fingerprint guard: repeated invalid report repair attempts are bounded and terminalized instead of looping.
- Distributed runtime endpoint leases: runtime endpoint usage is leased/cooldown guarded so single-slot model endpoints are not overrun by parallel AIF requests.
- Remote-only validation policy: docs/runbooks now state service, browser, perf, load, and audit-quality validation should target `192.168.88.67`, not local AIF service instances.
- Remote audit-quality canary: a deliberately bad/fabricated report was rejected fail-closed instead of accepted as trusted no-findings.

## Verification Summary

Local source checks passed:

- `git diff --check`
- targeted Prettier check for changed/untracked files
- `npm.cmd test`
- `npm.cmd run lint`
- `npm.cmd run build`

Remote-only service checks passed against `192.168.88.67`:

- `GET http://192.168.88.67/api/health`
- Playwright/perf e2e through `@aif/web` with `AIF_SKIP_DEV_SERVER=1`, `AIF_WEB_URL=http://192.168.88.67`, and `AIF_API_URL=http://192.168.88.67/api`
- Remote `botIntevra` branch isolation canary after worktree cleanup

The root `npm run format:check` is not a clean gate today because it checks unrelated pre-existing generated/documentation drift. Changed files were checked directly with Prettier.

## Generator Quality Follow-Up Status

Follow-up task `work-20260525-improve-audit-report-generation-quality` improved local generator-quality controls but is not Definition-of-Done complete.

Implemented and locally verified:

- Runtime tool audit evidence now exposes bounded output previews and `outputSha256` hashes to the audit report writer.
- Audit report writer prompts now include a hard allowed-evidence contract with machine-readable `allowedEvidence` entries for exact `ev_*` IDs, scope IDs, risk IDs, command text, output hashes, and output previews.
- The writer contract tells report generation to emit `source_inconclusive` when scoped evidence is insufficient, rather than expanding scope or fabricating verification.
- Coordinator terminal-block handling now backs up and removes untrusted untracked report artifacts and records `untrustedArtifactCleanup` details.
- Runtime bootstrap tests now verify the qwen adapter receives the shared endpoint lease store.
- A production call-site map was added at `docs/ops/audit-trust-callsite-map-20260525.md`.

Local verification passed for targeted shared/agent/runtime/data suites, full `npm.cmd test`, `npm.cmd run lint`, `npm.cmd run build`, and `git diff --check`.

Remote validation attempt:

- The remote AIF host was temporarily patched with the local source changes, rebuilt with Docker Compose, and health checked successfully.
- Fresh negative canary task `417342f5-3a96-4af7-8e05-22e8c643bf63` remained in planning and was paused after the plan-quality guard reached `replan 7/100`. It did not reach audit report generation.
- Fresh positive canary task `44c79a68-60ef-4465-a88c-a6bafbaf9e9b` remained in planning and was paused after the plan-quality guard reached `replan 9/100`. It did not produce a trusted positive report artifact.
- Existing negative control `cec8f23d-71a2-47dd-bb41-6dffb73b1ab4` remained fail-closed and untrusted.
- Existing positive control `b3de6310-e1bc-4129-92e4-48a32554ed72` currently projects as `artifactState=valid` but `artifactTrustLevel=untrusted`, so it does not satisfy the trusted positive canary acceptance criteria.
- The temporary remote source patch was reverted, the service was rebuilt back to clean commit `772ba2df08b5725decdbbeff15e7676fee6b1ba9`, and remote project worktrees ended clean.

Current conclusion:

> Audit trust promotion is hardened, bad reports still fail closed, and local generator-quality controls have been improved and tested. The remote Definition of Done is still blocked because fresh positive and negative generator canaries did not reach report production/trusted validation. Remaining open work is upstream audit planner/routing quality for direct audit canary tasks, followed by a fresh roadmap-backed positive trusted canary.

## Remote Worktree Cleanup Evidence

The failing canary task `5fd1ace1-ba50-4bc0-b604-56e65c7ca59d` originally blocked on:

```text
Branch isolation failure (dirty_worktree): Working tree at /home/www/botIntevra has uncommitted changes (?? audit/).
```

The dirty file was in the AIF Docker projects volume, not the host checkout:

- container path: `/home/www/botIntevra`
- old untracked file: `audit/remote-audit-quality-20260524-botintevra-data-safety.md`
- old file backup: `/srv/aif-handoff/backups/aif-worktree-cleanup/botIntevra-audit-volume-20260525-194417.tar.gz`

After cleanup, the canary passed branch isolation and reached review. The bad canary report was rejected fail-closed with:

- `invalid_report_manifest`
- `low_quality_report_evidence`
- `fake_or_placeholder_command_output`
- `missing_report_file_references`
- `contradictory_findings_and_no_findings`
- `manual_review_required`

The canary-created untracked report was also backed up and removed:

- canary report backup: `/srv/aif-handoff/backups/aif-worktree-cleanup/botIntevra-negative-canary-report-20260525-195020.tar.gz`

Final container `git status --short --untracked-files=all` for `/home/www/botIntevra` returned clean.

## Known Weak Spots For External Review

Please review these areas critically:

- The generator-quality follow-up added local allowed-evidence and cleanup controls, but fresh remote canaries were blocked upstream in planning before report generation. The next review should focus on planner/routing conditions that prevent direct audit canaries from producing child report work.
- The negative canary description requested `README.md`, but the deterministic diagnostic plan used `config` and `tests`; local prompt contracts now emphasize declared scope, but remote confirmation is still pending.
- The workflow now backs up and removes untrusted untracked audit artifacts during terminal blocked paths, but remote canary confirmation is still pending because the new canaries did not reach report generation.
- Runtime routing improved through endpoint leases, but live canary logs still showed implementer work on `8003` and reviewer work on `8005`; review whether long audit jobs should be forced to `8005` earlier in the lifecycle.
- The root format gate has unrelated baseline drift; decide whether to fix or narrow the repository-level format script.

## What To Ask The Reviewer

Please inspect whether the new audit trust contract is complete and hard to bypass:

1. Can any audit task still reach `done` or trusted `validated_no_findings` with only text logs, uncommitted files, stale artifacts, invalid manifests, missing source snapshots, or untrusted source reports?
2. Are lifecycle validation and synthesis trust checks applied in every path, including roadmap batches, direct audit tasks, retries, deterministic repair, and legacy compatibility paths?
3. Are typed reviewer/parser errors precise enough for operators to understand and for automation to avoid repeated low-value retries?
4. Does the runtime endpoint lease design actually prevent backpressure on single-slot endpoints across API/agent processes?
5. What should be changed next to make positive audit reports high quality, not merely fail-closed when bad?
