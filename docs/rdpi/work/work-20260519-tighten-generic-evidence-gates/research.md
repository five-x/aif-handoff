# Research

## Task framing and lane

- Task: `work-20260519-tighten-generic-evidence-gates`
- Lane: `work`
- Intake card: `docs/intake/work/work-20260519-tighten-generic-evidence-gates.md`
- RDPI path: `docs/rdpi/work/work-20260519-tighten-generic-evidence-gates`
- Scope: close generic evidence gaps without weakening existing audit/development guard requirements.

## Accepted planning sources

- `AGENTS.md` and the user-provided repository instructions require local repo facts before memory and mandatory independent RDPI gates for non-trivial work.
- `docs/intake/work/work-20260519-tighten-generic-evidence-gates.md` is the immutable task intent. Done-when requirements cover inferred development evidence, audit-card evidence arrays, waived acceptance criteria, TaskDetail queue display, and shared/API/data/web regressions.
- `docs/rdpi/work/work-20260519-systemic-task-lifecycle-review/result.md` is the local source follow-up that identifies the remaining evidence gaps.
- `packages/shared/src/taskCompletionEvidence.ts` only invokes implementation-manifest validation when `taskExplicitlyRequiresImplementationManifest()` sees explicit `taskIntent` or `isFix`, while `inferTaskIntent()` can infer feature/fix/docs/tests from title, description, alias, or tags.
- `packages/shared/src/implementationManifest.ts` already validates inferred development intents and requires passing verification output identity, acceptance refs, checklist sync, and review closure evidence.
- `packages/shared/src/auditCardDecision.ts` can currently set `finalStatus = "closed_verified"` solely from `otzAcceptanceSatisfied` plus `verificationStrength = "verified"`.
- `packages/shared/src/implementationManifest.ts` currently accepts waived criteria when `knownLimitations` is non-empty; there is no explicit waiver authority or waiver evidence reference.
- `packages/data/src/index.ts` uses explicit task intent normalization in generic projection and exposes project queue state with raw `countsByStatus`.
- `packages/data/src/index.ts` scheduler queue gating uses `countActivePipelineTasksForProject()`, counting `planning`, `plan_ready`, `implementing`, `review`, and non-terminal `blocked_external` rows while excluding backlog.
- `packages/web/src/components/task/TaskDetail.tsx` displays `Active queue` as `backlog + planning + implementing + review`, which excludes `plan_ready`/`blocked_external` and includes backlog.
- Independent explorer confirmed these surfaces and test targets with read-only local research.
- Current worktree has pre-existing unrelated modifications across source, docs, and tests. The implementation must edit only the files needed for this task and must not revert unrelated changes.

## Same-project memory

- Not queried before `PLAN PASS`. The task is repo-specific, local sources are sufficient for planning, and the RDPI boundary forbids shared-memory recall before plan review unless explicitly waived.

## Cross-project reusable patterns

- Not queried before `PLAN PASS`. No cross-project pattern is needed to choose the local implementation surface.

## Rejected or stale memory candidates

- None. No memory candidates were queried or accepted during pre-plan research.

## Open questions

- Whether waived acceptance criteria should become first-class closable with explicit waiver metadata or always block normal verified completion. The task allows either. The narrower design is to allow waivers only when explicit authority and waiver evidence refs are present.
- Whether TaskDetail should exactly replace the existing row or show two separate counts. The safer operator-facing design is to separate `Execution active` from `Queue-gating active`.

## Hypotheses

- If completion evidence uses inferred development intents before deciding whether a manifest is required, generic feature/fix/docs/tests tasks without normalized `taskIntent` will be blocked until they carry the same structured evidence as explicit development tasks.
- If generic timeline projection also uses inferred development intents, terminal inferred development tasks without valid manifests will project as untrusted instead of trusted generic task records.
- If `classifyAuditCardDecision()` requires non-empty implementation and verification evidence for `closed_verified`, weak/discarded audit findings can remain non-blocking while zero-evidence verified closure is rejected.
- If waived criteria require both explicit waiver authority and concrete waiver evidence refs, `knownLimitations` alone cannot satisfy normal development completion.
- If the queue API exposes scheduler queue-gating active count separately from execution-active status count, TaskDetail can stop presenting backlog as active pipeline work while preserving scheduler semantics.
