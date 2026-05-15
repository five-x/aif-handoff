# Deterministic Audit Synthesis Closeout

- Task ID: work-20260514-deterministic-audit-synthesis-closeout
- Lane: work
- Status: done
- Priority: critical
- Created: 2026-05-14
- Due: unset
- Source: live `audit-v14` final synthesis block after source cards terminalized as inconclusive
- RDPI Needed: yes
- RDPI Path: docs/rdpi/work/work-20260514-deterministic-audit-synthesis-closeout

## Request

Make final audit synthesis cards complete deterministically after roadmap generation, even when every source audit report is weak, missing, rejected, or `source_inconclusive`.

The synthesis card must not stay in `blocked_external` because its plan names only report artifacts. For roadmap audit synthesis, the batch artifact registry is the source of truth: the system should generate or repair a valid synthesis plan from the batch artifacts, then produce a final summary that preserves child report trust states and classifies the audit as `audit inconclusive` when trusted evidence is insufficient.

## Problem Statement

Live `audit-v14` reached a bad state:

- all six source cards are task-status `done`, but their artifact claims are untrusted (`source_inconclusive`, `rejected`, or missing report artifact);
- the final synthesis card `be1dd7eb-d1d5-49e8-9a58-a7d91461a9a4` blocked at `plan_ready`;
- its artifact `audit/2026-05-14-summary.md` remained `expected` with no attempt and an empty untracked file on the project checkout;
- plan quality rejected the synthesis plan for missing source boundaries even though a synthesis plan is supposed to target existing source report artifacts.

## Done When

- Roadmap synthesis tasks receive `auditArtifactRole="synthesis"` plan-quality handling that accepts explicitly enumerated source report artifacts as the evidence boundary.
- The deterministic synthesis plan builder expands the roadmap batch artifact list into exact report paths and child statuses instead of using wildcard targets like `audit/2026-05-14-*-audit.md`.
- Synthesis plans include:
  - `Report artifact: <summary path>`;
  - exact source report artifact paths from the batch registry;
  - `Excluded areas:` for source/config/test edits and non-batch artifacts;
  - expected summary fields: child report, artifact state, trust level, evidence, risk, proposed fix, verification, and final outcome;
  - explicit child/source report decision: source reports are existing required inputs and must be preserved in a status table.
- If source reports are all untrusted or missing, the final summary closes with `audit inconclusive`, not `validated_no_findings`.
- If at least one trusted source finding exists, the final summary carries it forward without downgrading or dropping its evidence.
- If trusted no-findings is claimed, the summary proves that every required source report is trusted and substantive.
- `audit-v14` or an equivalent regression fixture closes as a final inconclusive synthesis instead of remaining `blocked_external`.
- Tests cover:
  - all source reports `source_inconclusive`;
  - mixed `valid`, `rejected`, `missing`, and `source_inconclusive` source reports;
  - missing report file but present batch artifact;
  - empty existing synthesis artifact;
  - plan-quality retry exhaustion for synthesis does not strand the card;
  - final summary cannot claim stronger outcome than child artifacts support.

## Forward-Looking Guardrails

- Do not solve this only by relaxing `planQuality.ts`; the system must still reject marker-only source audit plans.
- Do not depend on source reports being committed on the synthesis branch. Synthesis input must come from batch artifact metadata and readable artifact content by branch/worktree or recorded content snapshot.
- Handle source reports that are physically absent but have terminal artifact states.
- Handle malformed source reports with literal `\n`, placeholder manifest fields, invalid line references, or missing content SHA by marking them untrusted in the synthesis table.
- Ensure a retry after deploy can recover an already-blocked synthesis card without direct database patching.

## Constraints

- Follow RDPI before implementation.
- Do not execute this task during intake.
- Preserve strict audit validation for source reports.
- Preserve `blocked_external` for true external blockers: missing access, runtime/provider failure, unsafe git isolation, or missing required operator input.
- Do not create child implementation tasks from the synthesis run.
- Do not mark weak or absent source reports as trusted valid.

## Notes

- Current code path terminalizes roadmap plan-quality exhaustion only for `artifact.role === "report"` in `packages/agent/src/coordinator.ts`.
- Current plan-quality logic has a synthesis-only exception, but it requires explicit child report artifact paths and does not work with wildcard-only plans.
- The live synthesis plan at `.ai-factory/plans/synthesize-audit-findings-2.md` used `audit/2026-05-14-*-audit.md`, not exact child paths.

## Links

- Related runbook: docs/ops/plan-b-v13-audit-runbook.md
- Related code: packages/shared/src/planQuality.ts
- Related code: packages/agent/src/coordinator.ts
- Related prior task: work-20260514-terminalize-roadmap-audit-plan-quality-exhaustion
- Related prior task: work-20260514-terminalize-roadmap-audit-stalls-as-inconclusive
