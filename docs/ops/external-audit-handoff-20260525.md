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

- The generator can still write a bad audit report; the new trust gates reject it, but positive audit report quality still depends on improving report generation and scoped evidence behavior.
- The negative canary description requested `README.md`, but the deterministic diagnostic plan used `config` and `tests`; this scope drift should be reviewed.
- The implementer produced an uncommitted report artifact during the negative canary. The guard caught it, but the workflow should ideally avoid leaving dirty report artifacts after blocked diagnostic runs.
- Runtime routing improved through endpoint leases, but live canary logs still showed implementer work on `8003` and reviewer work on `8005`; review whether long audit jobs should be forced to `8005` earlier in the lifecycle.
- The root format gate has unrelated baseline drift; decide whether to fix or narrow the repository-level format script.

## What To Ask The Reviewer

Please inspect whether the new audit trust contract is complete and hard to bypass:

1. Can any audit task still reach `done` or trusted `validated_no_findings` with only text logs, uncommitted files, stale artifacts, invalid manifests, missing source snapshots, or untrusted source reports?
2. Are lifecycle validation and synthesis trust checks applied in every path, including roadmap batches, direct audit tasks, retries, deterministic repair, and legacy compatibility paths?
3. Are typed reviewer/parser errors precise enough for operators to understand and for automation to avoid repeated low-value retries?
4. Does the runtime endpoint lease design actually prevent backpressure on single-slot endpoints across API/agent processes?
5. What should be changed next to make positive audit reports high quality, not merely fail-closed when bad?
