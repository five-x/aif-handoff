# Research - Harden Audit Runtime Quality Contract

## Task framing and lane

- Task ID: `work-20260511-harden-audit-runtime-quality-contract`
- Lane: `work`
- User intent: fix the `aif-handoff` audit runtime/quality contract after `audit-v5` canary symptoms.
- Scope boundary: the target is the `aif-handoff` platform. `botIntevra` is only a canary project registered inside AIF; the fix must be project-wide and must not special-case that registered project.
- Current user emphasis: audit generation and execution must cover the audited project as a whole, with the platform enforcing that audit cards produce trustworthy report artifacts rather than source/config/test edits or weak review-loop output.

## Accepted planning sources or local facts

- `AGENTS.md` confirms this is a Node/TypeScript repository and the source of truth for task history is `docs/rdpi/`.
- `docs/rdpi/work/work-20260510-harden-audit-roadmap-flow-contract/research.md` explicitly frames the prior work as platform-level implementation for `aif-handoff`; `botIntevra` was only a canary/proving project.
- `docs/rdpi/work/work-20260510-harden-audit-roadmap-flow-contract/result.md` records the current audit roadmap contract: typed audit import creates batch/artifact records, report artifacts are validated, invalid report artifacts are allowed to become terminal batch inputs, and synthesis waits for validated reports.
- `packages/shared/src/taskCompletionEvidence.ts` currently validates report presence, commit state, referenced paths, substantive evidence, low-quality evidence, tool activity, and manual review flags. It records `meaningfulChangedFiles`, but does not currently fail an audit task solely because committed changes include non-report files alongside the report artifact.
- `packages/shared/src/auditRoadmapContract.ts` maps completion evidence issue codes to audit batch failure families. Any new audit evidence issue needs a stable failure-family mapping.
- `packages/agent/src/reviewGate.ts` supports structured review comments first, then a legacy fallback model extraction path. The fallback can convert advisory text into rework findings because it asks a model to extract "points that must be fixed" from the whole review comment.
- `packages/agent/src/autoReviewHandler.ts` turns repeated request-changes into `manual_review_required` at max review iterations.
- `packages/agent/src/coordinator.ts` sends audit evidence failures back to rework before max iterations, then marks the artifact invalid or manual-review terminal when the limit is reached.
- `packages/agent/src/subagents/implementer.ts` already tells audit evidence repair mode to edit only the expected report artifact, but the runtime still needs a deterministic guard after the model acts.
- `packages/api/src/services/commitGeneration.ts` currently instructs the commit runtime to run `git add -A`. That is correct for generic implementation tasks, but it works against report-only audit cards when a task declares a single expected report artifact.
- Current dirty repo state includes unrelated generated docs/memory backup files. They must not be reverted or staged as part of this fix.

## Same-project memory

- Shared-memory server was reachable.
- Same-project memory lookup for prior audit roadmap/manual-review/Qwen context returned no usable context (`no-context`).
- Local repo facts and RDPI artifacts therefore remain authoritative for this task.

## Cross-project reusable patterns

- No cross-project memory was accepted. The issue is specific to the `aif-handoff` audit pipeline and its existing local RDPI history.

## Rejected or stale memory candidates

- No memory candidates were returned.

## Working hypotheses

- H1: Typed audit tasks with a declared report artifact need a deterministic "report-only delta" guard. If `meaningfulChangedFiles` includes any file other than the expected report artifact, completion should fail with an audit-content issue even if the report exists.
- H2: Review-gate fallback should be deterministic for legacy review sections. If legacy comments explicitly say every `Blocking Findings` section is `none`, advisories should not be treated as blocking fixes.
- H3: Audit evidence repair prompts should be tightened, but prompt-only changes are secondary. The primary safety net must be deterministic completion evidence and review-gate logic.
- H4: The generic commit workflow should keep `git add -A` for normal tasks, but audit/report tasks with a declared expected report artifact should receive a report-only staging prompt.

## Proposed verification focus

- Shared completion-evidence tests for audit report-only enforcement.
- Review-gate tests for legacy comments with `Blocking Findings: none` plus advisories.
- Commit-generation tests for report-only audit staging prompts versus generic `git add -A` prompts.
- Coordinator/agent tests only if state transition behavior changes.
- Focused workspace tests before broad lint/build.
