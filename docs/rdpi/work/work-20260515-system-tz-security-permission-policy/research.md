# Research

## Task Framing And Lane

- Task ID: `work-20260515-system-tz-security-permission-policy`
- Lane: `work`
- Intake card: `docs/intake/work/work-20260515-system-tz-security-permission-policy.md`
- RDPI path: `docs/rdpi/work/work-20260515-system-tz-security-permission-policy`
- RDPI needed: yes

The immutable intake request is to define and enforce per-intent execution permissions, shell command policy, network policy, dangerous command detection, human approval bridge, and secret redaction across runtime, evidence, logs, WebSocket, and chat.

Done conditions from the intake card:

- Permission modes exist for `danger_full_access`, `workspace_write`, `read_only`, `review_only`, and `audit_diagnostic_only`.
- Intent policy maps `feature`, `fix`, `tests`, `docs`, `spike`, and `audit` to default permission modes and allowed exceptions.
- Audit tasks cannot modify source/config/test files.
- Docs tasks cannot modify source files.
- Dangerous shell commands can be blocked by policy.
- Secret-like evidence is redacted before memory, evidence, runtime logs, activity logs, WebSocket payloads, or chat transcript persistence.
- Bypass mode is visible and audited.

## Accepted Planning Sources Or Local Facts

- `C:\Users\apron\Desktop\aif_handoff_system_tz.md`, section 19, defines the target permission modes and per-intent policy expectations. It also requires command allow/deny rules, network policy, secrets redaction, dangerous command detection, and a human approval bridge.
- `C:\Users\apron\Desktop\aif_handoff_system_tz.md`, Phase 8, lists deliverables: per-intent permission policy, command allow/deny rules, secret redaction checks, and bypass mode audit.
- `docs/kb/system-tz-contract-inventory-freeze.md` is the accepted System TZ planning inventory. It assigns security permission policy to this task and says review/security closure, API/WS trust-surface unification, chat/MCP attachment gates, runtime budget governance, and configuration governance belong to separate tasks.
- `docs/rdpi/work/work-20260515-system-tz-task-intent-contract-v2/result.md` says structured task intent policy and completion changed-file contradiction checks already exist. This task should extend that shared contract with execution permission policy rather than duplicating task intent.
- `docs/rdpi/work/work-20260515-system-tz-runtime-governance-usage-budget/result.md` says runtime stage metadata, usage outcomes, budget gates, and runtime-limit fallback policy already exist. This task should not redesign budget governance.
- `docs/rdpi/work/work-20260515-system-tz-source-backed-memory-knowledge/result.md` says product memory already has source-backed claims, redaction status, and approval enforcement. This task should reuse the shared redaction primitives and avoid creating a parallel memory store.
- `docs/rdpi/work/work-20260515-system-tz-operator-api-ws-trust-surfaces/result.md` says task/project operator surfaces and WebSocket events already exist. This task should add sanitization and permission visibility without expanding those surfaces beyond this task.

Static source inspection:

- `packages/shared/src/taskIntentContracts.ts` defines task intents and structured policy fields, including changed-file rules for audit/docs/tests/spike.
- `packages/shared/src/taskIntent.ts` contains `validateTaskIntentChangedFiles`, which enforces audit report-only and docs-only contradictions at completion/transition time.
- `packages/shared/src/taskCompletionEvidence.ts` integrates changed-file contradiction issues into completion evidence.
- `packages/api/src/services/runtime.ts`, `packages/api/src/routes/chat.ts`, and `packages/agent/src/subagentQuery.ts` currently derive `bypassPermissions` from `AGENT_BYPASS_PERMISSIONS` and pass adapter hooks such as `permissionMode` and `allowDangerouslySkipPermissions`.
- `packages/runtime/src/adapters/codex/cli.ts`, `sdk.ts`, and `appServer/run.ts` translate bypass state and explicit profile options into Codex approval/sandbox settings.
- `packages/runtime/src/adapters/claude/options.ts` and `cli.ts` translate bypass state into Claude permission mode and `--dangerously-skip-permissions`.
- `packages/runtime/src/adapters/qwenLocalAgent/tools.ts` already has the strongest local structured tool policy: secret-like path denial, repository-root containment, redacted tool events, `spawn(..., shell: false)`, and a narrow `run_shell` allowlist for `pwd` and `ls`.
- `packages/shared/src/runtimeLimitUtils.ts` exposes `redactProviderText` and `redactProviderTextForLogs`.
- `packages/shared/src/auditEvidenceLedger.ts` redacts audit evidence command metadata and output previews before evidence persistence.
- `packages/data/src/index.ts` redacts task activity logs on response projection, but `appendTaskActivityLog` currently persists raw appended text.
- `packages/api/src/routes/chat.ts` redacts task context before adding it to runtime prompts, but user/assistant chat message persistence and streamed WebSocket token payloads are not redacted at their persistence/send boundary.
- `packages/api/src/ws.ts` serializes WebSocket events directly without a generic payload sanitizer.
- `packages/data/src/index.ts` memory creation and approval already evaluate redaction and block unsafe approval.

## Same-Project Memory

No shared-memory server recall was used before `PLAN PASS` because the RDPI boundary forbids shared-memory recall before plan approval. Same-project local memory/review artifacts already in the repository were treated as local docs only where they summarized completed predecessor tasks.

Accepted local memory-derived facts:

- Prior System TZ task result artifacts record that task intent policy, runtime usage governance, source-backed memory redaction, and operator trust surfaces are already implemented as separate slices.
- These artifacts support keeping this task scoped to shared execution permission policy, bounded runtime adapter translation, redaction-at-boundary helpers, and focused tests/docs.

## Cross-Project Reusable Patterns

No cross-project reusable memory was consulted before `PLAN PASS`.

Reusable local pattern from the codebase:

- Put shared contracts in `@aif/shared`, export them from `index.ts` and `browser.ts` when frontend-safe, and make runtime/API/agent code consume the shared contract rather than hardcoding parallel policy strings.
- Keep runtime-specific behavior in adapters, but pass adapter-neutral execution intent through `RuntimeExecutionIntent`.

## Rejected Or Stale Memory Candidates

- Raw shared-memory recall was intentionally not used before plan approval.
- Generated Codex app-server types are not an implementation target; policy abstractions must live outside generated files.
- Full production path-specific sandboxing is out of scope for this task. The intake allows deferring advanced production sandboxing, but requires an explicit policy boundary.

## Scope Boundaries

In scope:

- Add first-class shared execution permission modes and per-intent policy mappings.
- Add a dangerous shell command classifier that can be used by local tool adapters and policy tests.
- Carry resolved permission policy through runtime execution intent and audit bypass visibility in task activity logs.
- Translate the shared mode to existing Claude/Codex/Qwen runtime knobs without weakening native profile overrides.
- Redact secret-like strings before task activity-log persistence, chat transcript persistence, and WebSocket payload delivery.
- Add focused tests for policy mapping, dangerous command detection, redaction boundaries, and runtime execution intent propagation.
- Update docs for the new policy contract.

Out of scope:

- New database tables for permission decisions.
- Human approval UI/workflow implementation. This task can expose the bridge contract and fail closed where a bridge is absent.
- Broad generated Codex app-server type edits.
- Full path-specific OS sandbox implementation for every adapter.
- New chat/MCP attachment gates, runtime budget governance, API/WS trust-surface expansion, or configuration governance.

## Risks

- Claude and Codex rely on native permission/sandbox behavior; AIF cannot fully prevent every write at a path-specific level without a stronger sandbox. The design must be explicit about this boundary and preserve completion evidence as a fail-closed backstop.
- Redacting chat transcripts at persistence time can change visible transcript text. This is required by the intake constraint when secret-like text is detected.
- Generic WebSocket sanitization must preserve event shape while redacting nested strings.
- The worktree is already dirty with many unrelated modifications. Implementation should be narrow and avoid unrelated formatting churn.
