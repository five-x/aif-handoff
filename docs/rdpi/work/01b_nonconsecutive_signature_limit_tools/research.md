# Research: 01b_nonconsecutive_signature_limit_tools

## Task framing and lane

- Task: `01b_nonconsecutive_signature_limit_tools`
- Lane: `work`
- Source: user-provided attachment `C:\Users\apron\.codex\attachments\dc931e69-d130-4273-84ec-41ccf3bc5526\pasted-text.txt`
- Base dependency: `01_hard_tool_loop_guard` is already present in commit `35e336e5 fix: harden qwen repeated tool loop guard`.
- Goal: extend qwen-local-agent repeated tool suppression so normalized fingerprints for repository-inspection tools are blocked inside one runtime attempt even when repeated calls are interleaved with other tools.
- Explicit exclusion: do not treat `git_status` as a simple args-only nonconsecutive signature tool; it needs state-aware result fingerprinting.

## Accepted planning sources or local facts

- RDPI preflight command was run before writing artifacts:
  - `python "$env:USERPROFILE\.codex\tools\codex-ensure-rdpi.py"`
  - Result captured in-thread: `STATUS: refreshed`
- Repo instructions were re-read after preflight.
- Current branch at planning time:
  - `codex/roadmap-audit-oom-hardening...origin/codex/roadmap-audit-oom-hardening`
- Existing unrelated dirty file, out of scope:
  - `docs/kb/windows-codex-bootstrap-validation.md`
- Current qwen adapter facts from `packages/runtime/src/adapters/qwenLocalAgent/api.ts`:
  - `NONCONSECUTIVE_LOOP_PRONE_TOOLS` currently contains only `finalize_audit_report_manifest`, `git_commit`, `run_shell`, and `validate_audit_report`.
  - `REPEATED_TOOL_CALL_SPECIAL_LIMITS` already contains special limits for tools including `read_file`, `list_files`, `git_status`, and `git_commit`.
  - `readRepeatedToolCallLimit()` accepts positive limits down to `1`.
  - `buildToolCallFingerprint()` normalizes tool arguments and includes file-state data for selected state-sensitive tools.
  - Per-run state includes `lastToolCallSignature` and `toolCallSignatureCounts`.
  - Current pre-execution suppression uses `signatureCount > limit` only when the tool is in `NONCONSECUTIVE_LOOP_PRONE_TOOLS`.
  - Suppression happens before `executeQwenLocalTool()` and before `emitToolResult()`, which is the right placement for "blocked call not executed".
- Current tool facts from `packages/runtime/src/adapters/qwenLocalAgent/tools.ts`:
  - `gitStatusTool()` runs `git status --short --branch`.
  - `executeQwenLocalTool()` dispatches `git_status` to `gitStatusTool()`.
  - Tool results include fields suitable for state fingerprinting such as `exitCode`, `output`, and `touchedFiles`.
- Current test facts from `packages/runtime/src/__tests__/qwenLocalAgent.test.ts`:
  - Existing repeated read/list/search coverage is consecutive or normalization-focused.
  - Existing `blocks repeated clean git_status checks` covers a consecutive clean loop.
  - Existing regression `allows git_commit retry after audit report content repair then blocks no-delta retry` must keep passing.
- Explorer gate:
  - A read-only explorer was spawned for this task.
  - Explorer confirmed the current gap: `read_file`, `list_files`, and `search_files` are not covered by nonconsecutive signature suppression.
  - Explorer recommended a post-result `git_status` fingerprint count keyed by call fingerprint.

## Same-project memory

- Not queried before `PLAN PASS`.
- Reason: this is repo/task-specific work, and the RDPI boundary forbids shared-memory recall before plan pass unless explicitly waived.

## Cross-project reusable patterns

- Not queried before `PLAN PASS`.
- Reason: local task spec and repository facts are sufficient for planning, and cross-project memory must not outrank local facts.

## Rejected or stale memory candidates

- None evaluated.
- No memory candidate was accepted, rejected, or allowed to override local repository facts.

## Scope boundaries

- Expected code files:
  - `packages/runtime/src/adapters/qwenLocalAgent/api.ts`
  - `packages/runtime/src/__tests__/qwenLocalAgent.test.ts`
- Optional helper extraction is allowed only if it reduces risk:
  - `packages/runtime/src/adapters/qwenLocalAgent/toolLoopFingerprint.ts`
  - companion helper unit test if the helper is extracted.
- Out of scope:
  - Prompt-only fixes.
  - Raising repeated-tool limits.
  - Adding `git_status` to a generic args-only signature set.
  - Provider retry/fallback after `repeated_tool_loop_blocked`.
  - Touching unrelated dirty KB docs.

## Open questions

- Exact helper placement can be decided during implementation after inspecting nearby utilities. Keeping helpers in `api.ts` is acceptable if the change remains readable.
- Full `npm.cmd test` may be time-consuming; it remains part of the verification plan unless it is blocked, in which case `result.md` must record the reason.
