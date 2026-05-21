# Plan: Roadmap Audit E2E Stabilization

## Gate

Implementation and live probing require independent `PLAN PASS`.

## Steps

1. Run independent plan review against this RDPI packet.
2. After `PLAN PASS`, implement local qwen runtime hardening before any live audit rerun:
   - per-profile budgets for `8003` and `8005` request estimates and `max_tokens`;
   - per-endpoint semaphore/concurrency 1 for `8003` and `8005`;
   - bounded model-facing tool/evidence/ledger payloads;
   - compact-summary finalization or controlled non-trusted failure after repository-inspection budget exhaustion;
   - circuit breaker with cooldown, `/models` health check, and bounded transport/timeout retry/fallback;
   - upstream HTTP/tool cancellation when the AIF run timeout aborts;
   - structured request-estimate logging with profileId, baseUrl, estimated input tokens, max output tokens, tool-call count, retry count, duration, and failure class.
3. Add targeted regression tests for every runtime hardening item from step 2, including a regression where an audit run has ledger evidence and repository-inspection budget exhaustion but must not restart full source inspection after timeout.
4. Run targeted tests, then broad validation as feasible:
   - qwen runtime adapter tests;
   - coordinator/implementer audit recovery tests;
   - `npm.cmd test`;
   - `npm.cmd run build`;
   - `npm.cmd run lint`.
5. Commit and push the runtime hardening, deploy it to `/opt/aif-handoff`, rebuild/restart affected services, and verify service health.
6. Verify server/deploy baseline:
   - `ssh -i "$env:USERPROFILE\.ssh\codex_linux_key_5" -o IdentitiesOnly=yes -o BatchMode=yes ubuntu@192.168.88.67 "cd /opt/aif-handoff && git rev-parse --short HEAD && git status --short && docker compose ps api agent web mcp"`
   - `curl.exe -fsS http://192.168.88.67/api/health`
   - `curl.exe -fsS http://192.168.88.67:3100/health`
7. Verify from AIF server `192.168.88.67` that both fixed local LLM endpoints respond quickly:
   - `curl -sS -m 8 http://192.168.88.62:8003/v1/models`
   - `curl -sS -m 8 http://192.168.88.62:8005/v1/models`
8. Query the live `botIntevra` project and current tasks. Record project id/name/root/defaults without exposing secrets.
9. Cleanup all current `botIntevra` cards using `DELETE /api/tasks/:id`. Do not delete project files or project records.
10. Verify cleanup through API plus direct SQLite counts on the server for this project/aliases:

- `tasks`
- `roadmap_batches`
- `roadmap_batch_artifacts`
- `roadmap_batch_artifact_attempts`

11. Use Browser/UI to create a Roadmap audit with a fresh alias `audit-e2e-YYYYMMDD-HHMMSS-a`; use the Roadmap dialog rather than only direct API.
12. Verify created task count, batch summary, report/synthesis artifact rows, tags, paused synthesis state, and no duplicate cards.
13. Start all source cards by enabling/triggering execution through supported UI/API controls, then observe until source cards and synthesis terminalize.
14. While observing, verify runtime protection evidence in logs: no concurrent requests to the same `8003`/`8005` endpoint, no request exceeds the configured endpoint budget, retry count stays bounded, circuit breaker cooldown/health check is visible after transport/timeout, and AIF timeout cancels the upstream request before retry/fallback state is written.
15. If a card hits `blocked_external`, `manualReviewRequired`, `source_inconclusive`, `rework_required`, `weak_sources`, a retry-loop, stale `synthesis_not_ready`, weak/irrelevant done output, or runtime hardening violation:

- capture task row, artifact row, attempt history, activity log, relevant agent/API logs, report file content, and git state;
- classify as valid missing user data vs system defect;
- for system defects, patch code/prompts/validators/coordinator/cleanup/runtime path;
- add a regression test for the exact failure shape;
- run targeted tests, then `npm.cmd test`, `npm.cmd run build`, and `npm.cmd run lint` when feasible;
- commit, push to `origin/main`, deploy to `/opt/aif-handoff`, rebuild/restart affected services, verify health;
- cleanup all cards and batch metadata, then restart from step 11 with a fresh alias.

16. When the first run is green, cleanup all cards and batch metadata again.
17. Create a second fresh alias `audit-e2e-YYYYMMDD-HHMMSS-b` through UI and repeat the full run.
18. After the second green lifecycle run, review source reports and synthesis:
    - every trusted finding has concrete path/line evidence, risk, proposed fix, and command/output verification;
    - no weak/missing/unsupported claims are promoted to trusted findings;
    - no irrelevant inventory-only report is treated as success;
    - synthesis accurately reflects child report quality and weak/discarded findings.
19. If quality fails, patch and restart from cleanup with two fresh aliases.
20. Run independent TEST gate with the final commands and live evidence packet.
21. Run independent REVIEW gate over code changes, tests, deploy evidence, cleanup evidence, both green runs, and synthesis quality evidence.
22. Write `result.md` with aliases, commits, tests, deploys, live outcomes, quality verdict, and gate verdicts.

## Verification Commands

- Targeted tests are chosen by the failure class.
- Runtime hardening tests must include qwen local request budget enforcement, output cap selection, endpoint semaphore/cooldown, bounded retry/fallback, payload compaction, and timeout abort propagation.
- Default broad local validation:
  - `npm.cmd test`
  - `npm.cmd run build`
  - `npm.cmd run lint`
- Server health:
  - `curl.exe -fsS http://192.168.88.67/api/health`
  - `curl.exe -fsS http://192.168.88.67:3100/health`

## Acceptance Mapping

- Runtime hardening: steps 2-5 and 14-15.
- Cleanup rows: steps 9-10 and 16.
- UI Roadmap creation: steps 11 and 17.
- Full execution observation: steps 13-15 and 17.
- Regression coverage and deploy loop: steps 3-5 and 15.
- Two clean runs: steps 16-18.
- Audit quality: steps 18-19.
- Independent gates: steps 20-21.

## Restart Addendum: 2026-05-21 live blocker

23. Patch implementer recovery so a ledger-writer timeout after repository-inspection budget exhaustion falls back to deterministic audit report repair instead of throwing controlled budget exhaustion immediately.
24. Keep deterministic repair fail-closed for empty or non-line-addressable scopes.
25. Run `npm.cmd test --workspace=@aif/agent -- --run src/__tests__/implementer.test.ts`.
26. Run relevant broader validation, commit, push, deploy, cleanup `auditstrong20260521oom1`, and restart from step 11 with a new alias.
