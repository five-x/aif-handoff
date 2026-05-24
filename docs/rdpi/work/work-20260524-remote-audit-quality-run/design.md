# Design

## Validation Shape

Run a fresh, narrow audit task through the remote service and evaluate the resulting audit output against an explicit quality rubric.

The task will ask for one diagnostic report artifact only. It does not authorize implementation fixes, code edits, config edits, runtime edits, queue edits beyond creating this one task, or follow-up task creation.

## Exact Remote Task Payload

Use the remote `botIntevra` project discovered from `GET /api/projects`:

- Project id: `e4a3a101-ec7f-4f93-9b68-e297ffe8952f`
- Root path: `/home/www/botIntevra`

```json
{
  "projectId": "e4a3a101-ec7f-4f93-9b68-e297ffe8952f",
  "title": "Audit remote-only audit-quality canary for botIntevra data safety",
  "description": "Diagnostic-only audit-quality canary. Scope: src/bot_intevra/attachments.py, src/bot_intevra/backup_crypto.py, src/bot_intevra/service.py. Allowed changes: only create or update the report artifact audit/remote-audit-quality-20260524-botintevra-data-safety.md. Do not modify source code, tests, config, runtime settings, queue state, memory artifacts, or documentation outside that report artifact. Report artifact: audit/remote-audit-quality-20260524-botintevra-data-safety.md. Risk hypotheses: risk-attachment-path-safety - attachment handling may allow path traversal, unsafe storage/deletion, or reading outside the intended project/user boundary; risk-backup-crypto-data-loss - backup crypto may allow corrupted backups, missing authentication/tag validation, unsafe key handling, or destructive restore/data-loss behavior; risk-service-state-consistency - service-layer flows may persist partial updates, duplicate state transitions, or delete/overwrite user data without adequate validation or recovery. Evidence requirements: cite concrete existing file paths and line or symbol references, observed command/API output where available, and explain whether each risk is validated, rejected, or inconclusive. This audit is diagnostic only; do not fix findings.",
  "priority": 4,
  "autoMode": true,
  "taskIntent": "audit",
  "skipReview": false,
  "useSubagents": true,
  "maxReviewIterations": 3,
  "tags": ["remote-audit-quality", "codex-validation", "2026-05-24", "botintevra"]
}
```

## Remote Scenario

1. Query `GET http://192.168.88.67/api/projects` and confirm the `botIntevra` project id `e4a3a101-ec7f-4f93-9b68-e297ffe8952f` is still present.
2. Create one high-priority audit task through `POST http://192.168.88.67/api/tasks`.
3. Poll the created task through `GET /api/tasks/:id`, plus timeline/trust/evidence endpoints.
4. Stop when the task reaches a terminal state (`done`, `blocked`, `blocked_external`, or equivalent) or when a practical timeout is reached.
5. Evaluate audit quality from the remote task fields and any exposed timeline/trust/evidence output.

## Quality Rubric

Score the run on:

- scoped diagnostic behavior, not implementation;
- concrete risk hypotheses;
- evidence depth and source binding;
- ability to distinguish findings, no-findings, inconclusive, and weak evidence;
- preservation of blockers/manual review when evidence is weak;
- specialized reviewer fan-out visibility where exposed by the task state.

## Minimum Evidence To Judge Quality

The quality verdict must be `inconclusive` rather than `pass` unless the run captures:

- remote task creation response including task id;
- terminal or current task status after polling;
- task detail response;
- timeline response or explicit endpoint failure/status;
- artifact-trust response or explicit endpoint failure/status;
- evidence response or explicit endpoint failure/status;
- report artifact content or a clear explanation that the artifact was not exposed through the available remote API;
- a status-specific interpretation: `done` requires report quality scoring; `blocked` or `blocked_external` requires blocker quality scoring; timeout requires an inconclusive verdict.

## Expected Output

Write `result.md` with:

- remote endpoints used;
- created task id and terminal or current status;
- audit quality assessment;
- exact evidence limits;
- any follow-up work as observations only, not auto-created child tasks.
