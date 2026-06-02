# Close AIF Roadmap Execution Blockers

- Task ID: work-20260602-close-aif-roadmap-blockers
- Lane: work
- Status: next
- Priority: critical
- Created: 2026-06-02
- Due: TBD
- Source: operator request after `zai-mi` roadmap closeout exposed repeated AIF stage and closeout blockers.
- RDPI Needed: yes
- RDPI Path: docs/rdpi/work/work-20260602-close-aif-roadmap-blockers

## Request

Close the AIF production blockers observed during the `zai-mi` roadmap run so future production-like project cards do not fall into avoidable `blocked_external` states for stage-contract, schema-output, or container-closeout defects.

## Done When

- Planning-stage and other pre-implementation stages cannot write to project files or run write-capable shell operations.
- Full-mode planner and accept-existing-plan flows reliably enforce and repair the `aif-plan-manifest` contract without requiring operator DB recovery for narrow implementation cards.
- QA-stage has deterministic schema repair or fallback for missing `aif-qa-artifact` output when mandatory evidence is already present, and blocks only when evidence is insufficient.
- Roadmap/container parent tasks can close cleanly when all executable children are verified, without requiring irrelevant QA/acceptance artifacts for the parent container.
- Requirements intake does not ask irrelevant primary-actor questions for test-only/internal operator cards when the task already declares actor and scope.
- Deploy/readiness handoff clearly distinguishes built artifacts, preview smoke, public domain routing, and git remote/push availability.
- Regression tests cover the `zai-mi` failure pattern end to end.
- `npm run format:check`, `npm run lint`, `npm run test`, and `npm run build` pass, or any pre-existing unrelated failures are documented.

## Constraints

- Do not weaken fail-closed production safety gates.
- Do not introduce OpenAI/Codex paid-token fallback into production-like routing.
- Do not expose secrets or raw provider diagnostics.
- Do not mark failed or missing evidence as accepted; deterministic fallback is allowed only from fresh mandatory evidence.
- Keep fixes scoped to AIF P0 production-safety and workflow reliability.

## Notes

- Observed blockers to investigate during RDPI:
  - planner-stage attempted a file write during planning;
  - planner repeatedly emitted output that failed `aif-plan-manifest` and checklist validation;
  - QA-stage twice omitted the required fenced `aif-qa-artifact` JSON block;
  - roadmap parent remained `done` but could not be `approve_done` because the API required fresh QA/acceptance artifacts for a container card;
  - `zai-mi` deploy readiness was built and preview-smoked, but public domain routing and product git remote were not configured.
- Treat these as systemic AIF defects, not as `zai-mi` application defects.

## Links

- RDPI: docs/rdpi/work/work-20260602-close-aif-roadmap-blockers
