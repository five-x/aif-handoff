# AIF Agent Workflow Stabilization

- Task ID: work-20260602-aif-agent-workflow-stabilization
- Lane: work
- Status: inbox
- Priority: critical
- Created: 2026-06-02
- Due: TBD
- Source: C:/Users/apron/Desktop/aif_agent_workflow_stabilization_tz.md
- RDPI Needed: yes
- RDPI Path: docs/rdpi/work/work-20260602-aif-agent-workflow-stabilization

## Request

Stabilize the AIF agent workflow by replacing prompt-only discipline with hard runtime, tool, parser, validator, and recovery contracts that prevent repeated loops, invalid implementation evidence, unsafe writes, premature implementation, and unbounded rework.

## Done When

- P0 hardening is implemented and verified: tool-loop guard, implementer checklist hard stop, invalid implementation manifest rejection, compact `aif-result` rework contract, and tool-level allowed write path enforcement.
- P1 hardening is implemented or split into explicit follow-up intake cards with preserved acceptance criteria: strict planner split-required state, same-failure fail-closed guard, audit/report prompt cleanup, config-driven reviewGate exceptions, and artifact-delta recovery gating.
- P2 observability is implemented or queued with explicit metric/event contracts.
- No new prompt-only guardrails are introduced, and prompt text does not grow to carry validation responsibilities that belong in code.
- Unit and integration tests cover the mandatory canaries from the source TZ, including repeated tool loops, pending checklist blocking, invalid manifest rejection, split-required non-runnability, same-failure fail-close, and denied write paths.
- `npm.cmd run lint`, `npm.cmd test`, and `npm.cmd run build` pass, or unrelated pre-existing failures are documented in RDPI closeout.
- RDPI `result.md` records changed files, tests, canaries, edge cases, unresolved follow-ups, and links after implementation.

## Constraints

- Do not execute implementation during intake.
- Do not perform a full architecture rewrite, model/provider replacement, full audit/report flow removal, UI rewrite, or business semantics change.
- Do not add long prompt blocks as the primary enforcement mechanism.
- Fail closed when evidence is invalid, repeated, or missing; deterministic fallback can only use validated fresh evidence.
- Audit/report stages must remain read-only except for the expected artifact path.
- Implementation write scope must come from the accepted plan manifest and runtime policy.
- Follow RDPI gates before implementation: research, design, plan, independent plan review, implementation, independent test, and independent review.

## Notes

Proposed development work items from the source TZ:

- P0-1: Add hard repeated-tool-loop guard across runtime stages, including normalized tool-call fingerprints, stage defaults, special caps for commit/finalize/status/read/list calls, `repeated_tool_loop_blocked` events, and controlled failures.
- P0-2: Add implementer checklist hard stop after sync; pending checklist items must block as `blocked_external` with deterministic `implementation_checklist_incomplete` reason and rework routing.
- P0-3: Reject invalid deterministic implementation manifest fallback as accepted evidence; keep normalized JSON only as diagnostic metadata and route invalid manifests to rework/manual handling by limit.
- P0-4: Replace verbose rework prompt output with compact fenced `aif-result` JSON for rework, backed by a shared parser/validator helper; allow legacy fallback only for clean first-run paths.
- P0-5: Enforce allowed write paths at tool level for file writes, patches, edits, `git add`, `git commit`, and write-capable shell commands; deny broad/destructive writes and source edits in audit/report.
- P1-1: Require strict fenced `aif-planning-decision` state for planner decisions; `split_required` must not persist a runnable plan or route to implementer.
- P1-2: Add same-failure fingerprints that include task, stage, artifact, validation issues, blocking findings, source snapshot, and allowed write paths; repeated fingerprints must fail closed without another agent rework.
- P1-3: Clean up audit/report prompts into a positive trusted-finding contract and move blacklist-style enforcement into validator patterns and issue codes.
- P1-4: Move project-specific ReviewGate exceptions out of generic code into config-driven providers.
- P1-5: Make runtime recovery compare artifact delta, validator fingerprint, tool-loop pattern, and blocked-reason family before retrying.
- P2-1: Add observability counters/events for tool-loop blocks, checklist blocks, invalid manifest rejection, same-failure fail-closed, split-required decisions, missing prompt contracts, and denied write paths.

Expected affected areas from the source TZ include `packages/runtime/src/adapters/qwenLocalAgent/api.ts`, `packages/runtime/src/adapters/qwenLocalAgent/tools.ts`, `packages/shared/src/runtimeStagePolicy.ts`, implementer/coordinator code, implementation manifest and completion evidence helpers, and new shared contract helpers/tests.

## Links

- Source TZ: C:/Users/apron/Desktop/aif_agent_workflow_stabilization_tz.md
- RDPI: docs/rdpi/work/work-20260602-aif-agent-workflow-stabilization
