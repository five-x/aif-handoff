# Design

## Chosen design

Use targeted deterministic hardening across the existing lifecycle contracts rather than adding new workflow stages.

1. Stage write safety:
   - Extend runtime stage caps with read-only execution defaults for researcher, designer, planner, plan-checker, reviewer, QA, security, audit, and synthesis.
   - Apply these defaults to Codex adapter options so non-bypass pre-implementation stages resolve `sandboxMode: read-only`.
   - Add Qwen-local read-only shell denial for write-capable shell commands while keeping inspection commands available.

2. Plan manifest repair:
   - Teach manifest normalization to replace malformed single manifest blocks when a deterministic manifest can be built from the task and plan.
   - Normalize `accept_existing_plan` disk content before quality evaluation and persist the normalized plan if valid.
   - Keep broad/multi-area cards fail-closed through existing task-size quality checks.

3. QA artifact fallback:
   - Keep strict fallback pass conditions: every mandatory item must be unblocked, from fresh implementation evidence, and `passed`.
   - Improve fallback metadata/markdown so schema repair is auditable and deterministic when the model omits `aif-qa-artifact`.

4. Container closeout:
   - Add a data helper that determines whether a container parent has satisfied direct-child closeout policy.
   - Exempt only such container parents from executable QA/acceptance freshness checks during `approve_done`.
   - Preserve child task QA/acceptance and completion-evidence gates.

5. Requirements actor intake:
   - Treat explicit internal/test-only/operator/system-maintenance cards as having an actor signal when scope and acceptance are already declared.

6. Deploy/readiness handoff:
   - Expand acceptance pack readiness metadata and markdown to distinguish built artifacts, preview smoke, public domain routing, and git remote/push availability.
   - Report unknown/unconfigured deploy signals as limitations rather than failed evidence unless the task explicitly requires public deployment.

## Pre-PLAN boundary

- Allowed before `PLAN PASS`: task framing, local file reads/searches, planning-only RDPI artifact edits, and independent plan review.
- Not allowed before `PLAN PASS`: code implementation, tests/dev servers/live endpoint checks, worker logs, scheduler reads, endpoint probes, or shared-memory recall.

## Decision candidates

- Non-implementation lifecycle stages should default to read-only execution, with explicit write scopes reserved for implementation or deterministic artifact finalization.
- Container parent approval should be based on child closeout state, not parent-owned executable QA artifacts.
- Deterministic schema fallback may pass only from fresh mandatory evidence; malformed or missing evidence remains blocked.
