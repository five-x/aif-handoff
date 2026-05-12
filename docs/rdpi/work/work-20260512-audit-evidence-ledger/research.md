# Research: Audit Evidence Ledger

## Task framing and lane

- Task: `work-20260512-audit-evidence-ledger`
- Lane: `work`
- Intake card: `docs/intake/work/work-20260512-audit-evidence-ledger.md`
- RDPI required: yes
- Goal: add a bounded, redacted evidence ledger so audit reports can cite runtime-captured evidence IDs for file reads, searches, and shell command inspection without turning the general activity log into raw transcript storage.

## Accepted planning sources

- `AGENTS.md` and the task card are accepted as governing scope.
- `docs/kb/audit-evidence-provenance-contract.md` is the parent contract. It defines `EvidenceLedger` as the future authoritative runtime evidence source and says runtime capture/schema work belongs to this task.
- `docs/intake/work/work-20260512-structured-audit-report-manifest.md` and its implemented validator surface are relevant because manifests already carry `evidenceRefs`.
- Local source inspection only was performed before `PLAN PASS`; no live service checks, worker-report reads, runtime probing, or shared-memory lookup was performed.

## Current local facts

- `packages/shared/src/auditReportValidator.ts` already parses an `audit-report-manifest` block with `auditPlanId`, `taskId`, `sourceSnapshot`, `outcome`, and `evidenceRefs`. Today, `evidenceRefs` are only syntactic manifest fields; they are not checked against captured runtime evidence.
- `packages/shared/src/auditSourceEvidence.ts` classifies command-shaped markdown evidence and already treats inventory commands such as `git ls-files`, `git status`, `ls`, `find`, `Get-ChildItem`, and file-existence checks as inventory-only.
- `packages/agent/src/hooks.ts` intentionally logs concise activity entries and avoids tool response payloads. This safety decision must be preserved.
- `packages/agent/src/subagentQuery.ts` bridges runtime `onToolUse` and `onEvent` callbacks into activity/watchdog behavior. It is the narrow task-context point for persisting runtime evidence without changing every caller.
- `packages/runtime/src/toolEvents.ts` emits generic `tool:use` events. Qwen local agent also emits `tool:result` events with exit codes and touched files, but no raw output preview today.
- `packages/runtime/src/adapters/qwenLocalAgent/tools.ts` has first-class read/list/shell tool implementations with sanitized output already bounded for model use. It is a good source for ledger-safe output hashes/previews.
- `packages/shared/src/schema.ts` and `packages/shared/src/db.ts` own SQLite schema and migrations. There is no current evidence ledger table.
- `packages/data/src/index.ts` owns append/query helpers for persisted tables and is the right layer for ledger insert/list helpers.

## Same-project memory

- Same-project memory may be useful after `PLAN PASS` for close-out and memory review, but the plan boundary prohibits shared-memory recall before the independent plan gate.

## Cross-project reusable patterns

- Follow existing idempotent SQLite migration style in `packages/shared/src/db.ts`.
- Follow existing bounded/redacted persistence patterns from query audit and provider text redaction.

## Open questions

- The repo has no first-class `AuditPlan` or `SourceSnapshot` table yet. This task should use manifest-compatible IDs and deterministic current snapshot derivation rather than creating a full plan/snapshot domain.
- Some runtimes do not expose result payloads for every repository tool. The first rollout should capture evidence where structured runtime/hook data exists and keep unsupported transports fail-closed for ledger-backed validation.

## Hypotheses

- H1: A shared audit evidence model plus append-only DB table can satisfy this task without changing general activity logging semantics.
- H2: Runtime capture can start at the agent/task boundary, using Claude PostToolUse hooks and Qwen tool result events as the first concrete capture sources.
- H3: Manifest validation can accept an optional ledger context and fail closed when cited IDs are missing, bound to the wrong task/plan/snapshot, or only discovery-grade for no-findings.
- H4: A bounded redacted preview plus SHA-256 hashes is enough for reviewability without persisting raw unsafe output.
