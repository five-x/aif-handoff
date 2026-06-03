# Research - 05_allowed_write_paths_tool_policy

## Task framing and lane

- Task id: `05_allowed_write_paths_tool_policy`.
- Lane: `work`.
- Source spec: `C:\Users\apron\Desktop\aif_stabilization_tz_pack\05_allowed_write_paths_tool_policy.md`.
- Priority: P0.
- Goal: enforce `allowedWritePaths` at the tool/runtime layer so agents cannot mutate files outside approved paths through write tools, patch tools, git staging/commit, shell commands, or wrappers.
- RDPI preflight: `python "$env:USERPROFILE\.codex\tools\codex-ensure-rdpi.py"` returned `STATUS: ready`.

## Accepted planning sources or local facts

- `AGENTS.md` requires Node commands: build `npm.cmd run build`, test `npm.cmd test`, lint `npm.cmd run lint`, run `npm.cmd run dev`.
- `packages/runtime/src/adapters/qwenLocalAgent/tools.ts` defines the Qwen local-agent tool schema and all local tool implementations.
- `packages/runtime/src/adapters/qwenLocalAgent/api.ts` owns tool-call loop orchestration, workflow tool availability, event emission, repeated-call suppression, and model feedback.
- `packages/runtime/src/__tests__/qwenLocalAgent.test.ts` already contains the focused Vitest coverage for the Qwen local-agent tool layer.
- `packages/shared/src/permissionPolicy.ts` contains shared shell permission policy data, but the active write-path enforcement in this adapter is currently embedded in `tools.ts`.
- No `packages/shared/src/toolWritePolicy.ts` exists today.

Existing enforcement:

- `readAllowedWritePaths` reads `input.execution?.allowedWritePaths`, normalizes project-relative paths, and stores them in the tool context.
- `assertWritePathAllowed` denies generated/dependency directories and rejects paths outside explicit `allowedWritePaths` with an error beginning `write_path_not_allowed: <path>`.
- `write_file` resolves inside the project root, checks `assertWritePathAllowed`, then writes.
- `apply_patch` extracts touched paths from patch headers, checks each touched path before `git apply`, and denies symlink/executable patch modes.
- Audit helper tools `compute_audit_report_hash`, `finalize_audit_report_manifest`, and `validate_audit_report` also check allowed paths.
- `run_shell` is structured rather than a raw shell string. It allows only `pwd`, `ls`, and package managers, runs with `shell: false`, sanitizes the environment, and inspects package-manager scripts for write intent under scoped allowed paths.
- `git_commit` has no raw `git_add` companion tool. It accepts explicit `paths`, checks each path against `allowedWritePaths`, runs `git add -- ...paths`, then commits with an explicit pathspec.
- Existing tests already cover scoped denial for `write_file`, `apply_patch`, `git_commit`, glob boundaries, generated/dependency dirs, dangerous package-manager scripts, dependency hydration scope, symlinks/junctions, VCS control paths, and read-only workflow shell restrictions.
- `packages/agent/src/subagents/implementer.ts` already derives implementation-mode write paths from the approved plan: `implementationAllowedWritePathsFromPlan()` reads `readAifPlanManifestSnapshot(planText)`, unions `planManifest.scope` with `planManifest.expectedArtifactPaths`, normalizes separators, and deduplicates.
- The same implementer path passes audit/report runs as `allowedWritePaths: [expectedAuditReportArtifactPath]`.
- `packages/agent/src/subagents/implementer.ts` passes implementation-mode `implementationAllowedWritePaths` through `createRuntimeWorkflowSpec(... metadata.allowedWritePaths ...)`.
- `packages/agent/src/subagentQuery.ts` sanitizes `workflowSpec.metadata.allowedWritePaths` and forwards it into `RuntimeExecutionIntent.allowedWritePaths`.
- `packages/shared/src/implementationManifest.ts` validates completed implementation changed files against the approved `aif-plan-manifest.scope` plus `expectedArtifacts`.

Planning gaps against the source spec:

- Tool denial results do not currently include `policyViolation: true`.
- `qwenToolResultForModel` does not serialize `policyViolation`, so the model cannot distinguish a hard policy denial from an ordinary failed command.
- `emitToolResult` logs the error string but does not include a structured `policyViolation` flag.
- `api.ts` currently feeds failed tool results back into the agent loop; a policy violation does not immediately stop the run.
- `git_commit` commits only explicit allowed paths, but it does not inspect or fail on pre-existing staged files outside allowed paths before commit.
- Raw `git add .`, `git add -A`, and `git commit -a` are not reachable through `run_shell`, but package-manager scripts can currently contain `git add`/`git commit` text without a dedicated broad-git denial pattern.
- Existing implementation-mode derivation should be protected by an agent regression test that proves `aif-plan-manifest.scope` plus `expectedArtifacts` are forwarded as runtime `allowedWritePaths`.
- There is no literal `recoveryChildScope` field in the current codebase. The local mechanism for recovery child write boundaries is split-proposal `TaskSplitProposedChild.fileBoundaries`.
- `packages/agent/src/implementationRecoveryPack.ts` currently builds `proposedChildren` for implementation recovery but does not assign `fileBoundaries`.
- `packages/api/src/services/roadmapGeneration.ts` maps proposal child `fileBoundaries` into child microtask metadata, then into a child `aif-plan-manifest.scope` and `expectedArtifacts`.
- Therefore the recovery-child scope requirement maps to adding explicit `fileBoundaries` to implementation recovery proposed children and testing that they are derived from the same approved plan-manifest boundary.

## Same-project memory

- Shared-memory recall was not used before `PLAN PASS` because the RDPI boundary forbids shared-memory recall in the planning stage unless explicitly waived.
- Local repo facts and existing tests are sufficient to plan this task.

## Cross-project reusable patterns

- Not consulted before `PLAN PASS` for the same reason.

## Rejected or stale memory candidates

- None consulted.

## Plan review history

- First independent plan review returned `PLAN FAIL`.
- Required revisions:
  - Account for manifest-derived implementation allowed paths instead of excluding them.
  - Add explicit tests or regression assertions for audit source denied/report allowed, broad git denied, explicit git allowed, destructive shell denied, feature outside manifest scope denied, and structured policy violation.
  - Add targeted proof that broad git operations cannot execute through `run_shell` or tool wrappers.
- Second independent plan review returned `PLAN FAIL`.
- Required revisions:
  - Include the implementation recovery child scope path by proving proposed recovery children carry explicit write boundaries.
  - Make the denial result shape explicit in acceptance criteria and tests: `ok === false`, `error` starts with `write_path_not_allowed: <path>` for denied paths, and `policyViolation === true`.

## Independent explorer findings

The read-only explorer independently confirmed:

- Path enforcement is centralized enough in `tools.ts` to add structured denial semantics without introducing a new shared helper.
- `api.ts` must be touched if policy denials should stop the loop or appear in activity log data.
- Broad `git add .`, `git add -A`, and `git commit -a` are not reachable through the current structured tool API.
- The concrete remaining mismatches are structured `policyViolation: true`, loop termination on policy violation, and pre-existing staged-file validation for `git_commit`.
