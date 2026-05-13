# Harden Audit Roadmap Flow Contract

- Task ID: work-20260510-harden-audit-roadmap-flow-contract
- Lane: work
- Status: done
- Priority: high
- Created: 2026-05-10
- Due: unset
- Source: user request after systemic audit roadmap flow investigation
- RDPI Needed: yes
- RDPI Path: docs/rdpi/work/work-20260510-harden-audit-roadmap-flow-contract

## Request

Harden the upper-level `aif-handoff` audit roadmap flow so typed audit batches work reliably across projects, instead of fixing each newly observed blocker with another narrow parser or guard exception.

The canary project is only a proving ground. The target is the platform flow: roadmap generation/import, task queueing, git isolation, runtime agent execution, review gate, completion guard, approve flow, and final synthesis.

## Done When

- There is one explicit end-to-end audit roadmap flow contract covering generation, import, execution, validation, review, completion, and synthesis.
- Audit report artifacts have a canonical machine-validated contract or schema instead of relying only on free-form markdown and scattered regex acceptance.
- The same audit artifact validator is reused by post-implementation validation, review gate, completion guard, and approve-time checks.
- Recoverable audit artifact failures return the task to rework with actionable findings instead of immediately parking the batch as `blocked_external`.
- `blocked_external` is reserved for real external blockers such as runtime capability, provider limits, git isolation failures, missing access, or operator-required intervention.
- Roadmap batches have a durable batch/artifact model that tracks expected audit report artifacts, producing task ids, branches or worktrees, validation state, and synthesis readiness.
- The synthesis task reads only validated batch artifacts and cannot produce a false empty summary because reports live on separate task branches or worktrees.
- Branch-isolated auto-queue has a safe default or enforced policy for task worktrees so one task branch does not leave the shared checkout in a state that affects later tasks.
- The UI/API expose clear batch-level and task-level failure messages that distinguish invalid artifact content, rework-needed findings, external blockers, and synthesis-not-ready states.
- A platform-level integration canary proves the full audit batch flow with a deterministic or mocked tool-capable runtime, without depending on botIntevra-specific source files.
- Regression coverage includes positive and negative flows: valid audit report, invalid report requiring rework, external runtime/git blocker, validated synthesis, and no partial/false batch success.
- Existing valid typed-intent behavior and generic roadmap behavior remain intact.
- RDPI result records the final flow contract, failure taxonomy, migration notes, test commands, and any live canary evidence after `PLAN PASS`.
- Independent `TEST PASS` and `REVIEW PASS` gates pass before close-out.

## Constraints

- Intake only for this turn; do not implement this task yet.
- Follow RDPI before implementation.
- Before `PLAN PASS`, do not perform live server checks, runtime probing, scheduler/log inspection, or downstream config mutation unless explicitly waived.
- Treat botIntevra only as a canary/proving project, not as the target architecture.
- Design for many projects with different repositories, languages, branch policies, and runtime profiles.
- Prefer deterministic platform contracts and validators over prompt-only guidance.
- Do not create and execute derived child implementation tasks in the same run.
- Keep changes diffable, reviewable, and covered by focused plus integration tests.
- Keep raw secrets out of repository files, task logs, and shared memory.

## Notes

- Prior fixes hardened individual boundaries: typed task intents, audit roadmap validation, audit quality gates, completion evidence parsing, rework after committed reports, and summary path handling.
- The systemic gap is that those boundaries do not currently form one shared contract for the whole audit batch lifecycle.
- Known investigation points include `packages/api/src/services/roadmapGeneration.ts`, `packages/shared/src/taskIntent.ts`, `packages/shared/src/taskCompletionEvidence.ts`, `packages/agent/src/reviewGate.ts`, `packages/agent/src/coordinator.ts`, git isolation/worktree utilities, and roadmap/auto-queue tests.
- This task should produce one coherent platform fix or an explicitly approved split plan if the scope must be decomposed after research/design.

## Links

- RDPI scaffold: ../../rdpi/work/work-20260510-harden-audit-roadmap-flow-contract
