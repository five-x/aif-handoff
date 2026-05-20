# Plan: Roadmap Audit E2E Stabilization

## Gate

Implementation and live probing require independent `PLAN PASS`.

## Steps

1. Run independent plan review against this RDPI packet.
2. After `PLAN PASS`, verify server/deploy baseline:
   - `ssh -i "$env:USERPROFILE\.ssh\codex_linux_key_5" -o IdentitiesOnly=yes -o BatchMode=yes ubuntu@192.168.88.67 "cd /opt/aif-handoff && git rev-parse --short HEAD && git status --short && docker compose ps api agent web mcp"`
   - `curl.exe -fsS http://192.168.88.67/api/health`
   - `curl.exe -fsS http://192.168.88.67:3100/health`
3. Query the live `botIntevra` project and current tasks. Record project id/name/root/defaults without exposing secrets.
4. Cleanup all current `botIntevra` cards using `DELETE /api/tasks/:id`. Do not delete project files or project records.
5. Verify cleanup through API plus direct SQLite counts on the server for this project/aliases:
   - `tasks`
   - `roadmap_batches`
   - `roadmap_batch_artifacts`
   - `roadmap_batch_artifact_attempts`
6. Use Browser/UI to create a Roadmap audit with a fresh alias `audit-e2e-YYYYMMDD-HHMMSS-a`; use the Roadmap dialog rather than only direct API.
7. Verify created task count, batch summary, report/synthesis artifact rows, tags, paused synthesis state, and no duplicate cards.
8. Start all source cards by enabling/triggering execution through supported UI/API controls, then observe until source cards and synthesis terminalize.
9. If a card hits `blocked_external`, `manualReviewRequired`, `source_inconclusive`, `rework_required`, `weak_sources`, a retry-loop, stale `synthesis_not_ready`, or weak/irrelevant done output:
   - capture task row, artifact row, attempt history, activity log, relevant agent/API logs, report file content, and git state;
   - classify as valid missing user data vs system defect;
   - for system defects, patch code/prompts/validators/coordinator/cleanup/runtime path;
   - add a regression test for the exact failure shape;
   - run targeted tests, then `npm.cmd test`, `npm.cmd run build`, and `npm.cmd run lint` when feasible;
   - commit, push to `origin/main`, deploy to `/opt/aif-handoff`, rebuild/restart affected services, verify health;
   - cleanup all cards and batch metadata, then restart from step 6 with a fresh alias.
10. When the first run is green, cleanup all cards and batch metadata again.
11. Create a second fresh alias `audit-e2e-YYYYMMDD-HHMMSS-b` through UI and repeat the full run.
12. After the second green lifecycle run, review source reports and synthesis:
    - every trusted finding has concrete path/line evidence, risk, proposed fix, and command/output verification;
    - no weak/missing/unsupported claims are promoted to trusted findings;
    - no irrelevant inventory-only report is treated as success;
    - synthesis accurately reflects child report quality and weak/discarded findings.
13. If quality fails, patch and restart from cleanup with two fresh aliases.
14. Run independent TEST gate with the final commands and live evidence packet.
15. Run independent REVIEW gate over code changes, tests, deploy evidence, cleanup evidence, both green runs, and synthesis quality evidence.
16. Write `result.md` with aliases, commits, tests, deploys, live outcomes, quality verdict, and gate verdicts.

## Verification Commands

- Targeted tests are chosen by the failure class.
- Default broad local validation:
  - `npm.cmd test`
  - `npm.cmd run build`
  - `npm.cmd run lint`
- Server health:
  - `curl.exe -fsS http://192.168.88.67/api/health`
  - `curl.exe -fsS http://192.168.88.67:3100/health`

## Acceptance Mapping

- Cleanup rows: steps 4-5 and 10.
- UI Roadmap creation: steps 6 and 11.
- Full execution observation: steps 8-9 and 11.
- Regression coverage and deploy loop: step 9.
- Two clean runs: steps 10-12.
- Audit quality: steps 12-13.
- Independent gates: steps 14-15.
