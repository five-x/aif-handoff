# Design: 01b_nonconsecutive_signature_limit_tools

## Desired behavior

Within one qwen-local-agent runtime attempt, repeated tool calls should be suppressed before execution when they exceed the configured per-tool repeated-call limit by either:

- consecutive repetition of the same tool-call signature;
- nonconsecutive repetition of an eligible normalized tool-call signature;
- stable repeated `git_status` result state for the same `git_status` call fingerprint.

Suppressed calls must emit `repeated_tool_loop_blocked`, must not call `executeQwenLocalTool()`, must not emit `tool:result`, and must not trigger provider fallback or retry.

## Signature-limited tools

Introduce a separate set in `packages/runtime/src/adapters/qwenLocalAgent/api.ts`:

```ts
const NONCONSECUTIVE_SIGNATURE_LIMIT_TOOLS = new Set([
  "read_file",
  "list_files",
  "search_files",
  "run_shell",
  "git_commit",
  "finalize_audit_report_manifest",
  "validate_audit_report",
]);
```

The old `NONCONSECUTIVE_LOOP_PRONE_TOOLS` can be removed or left unused, but the suppression rule should use the new set. `git_status` is deliberately excluded.

## Suppression decision

Use `safeToolName` consistently after parsing and normalization. The pre-execution suppression shape should be:

```ts
const repeatedConsecutiveLoop = repeatedToolCallCount > effectiveRepeatedToolCallLimit;

const repeatedSignatureLoop =
  NONCONSECUTIVE_SIGNATURE_LIMIT_TOOLS.has(safeToolName) &&
  signatureCount > effectiveRepeatedToolCallLimit;

const repeatedGitStatusLoop =
  safeToolName === "git_status" && gitStatusRepeatedStableCount > effectiveRepeatedToolCallLimit;

const shouldSuppressRepeatedCall =
  repeatedConsecutiveLoop || repeatedSignatureLoop || repeatedGitStatusLoop;
```

For ordinary signature-limited tools, `signatureCount` can continue to be incremented before execution because the count represents call attempts. The existing file-state-aware fingerprinting for `git_commit`, `finalize_audit_report_manifest`, and `validate_audit_report` must remain intact, so artifact changes produce a different signature and allow a legitimate retry.

## Git status state-aware branch

`git_status` should not be blocked by args-only call fingerprint counts. Instead:

- Compute the existing call fingerprint before execution.
- Maintain per-run state:
  - `gitStatusResultFingerprintCounts: Map<string, Map<string, number>>`
- Before executing another `git_status`, derive the maximum previously seen identical result count for that call fingerprint.
- Suppress only when that stable result count has reached/exceeded the effective limit such that the next call would exceed it.
- After a successful `git_status` execution, compute:

```ts
sha256(
  stableStringify({
    toolName: "git_status",
    exitCode: result.exitCode ?? null,
    output: normalizeGitStatusOutput(result.output),
    touchedFiles: [...(result.touchedFiles ?? [])].sort(),
  }),
);
```

- Store the new count under the current call fingerprint.

This means a third clean status in a clean interleaved loop is blocked before execution with limit `2`, while a sequence of clean -> dirty -> clean is allowed because the repeated result state did not exceed the limit.

## Git status normalization

Add a small helper near the fingerprint helpers unless extraction becomes cleaner:

```ts
function normalizeGitStatusOutput(output: unknown): string {
  return String(output ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
}
```

If output shape is not a plain string in the current code, adapt this helper to the actual `QwenToolResult` type without changing user-visible output.

## Event metadata

For nonconsecutive signature blocks:

- `nonconsecutive: true`
- `signatureCount`
- `repeatedToolCallCount`
- `repeatedCount: Math.max(repeatedToolCallCount, signatureCount)`
- `repeatedToolCallLimit`
- `fingerprint`
- `fingerprintInput`
- `targetPath`

For consecutive-only blocks:

- `nonconsecutive: false`

For state-aware `git_status` blocks, include the nonconsecutive metadata plus:

- `gitStatusStateRepeated: true`
- `gitStatusResultFingerprint`

If the implementation only knows the previously repeated result fingerprint before execution, use that value in the event.

## Test design

Add focused tests in `packages/runtime/src/__tests__/qwenLocalAgent.test.ts`:

- `blocks interleaved repeated read_file calls by signature count`
- `honors repeatedToolCallLimit=1 for interleaved read_file calls`
- `blocks interleaved repeated list_files calls by signature count`
- `blocks interleaved repeated search_files calls by signature count`
- `blocks interleaved repeated stable git_status checks`
- `does not block git_status when repository state changes between checks`

Keep the existing regression:

- `allows git_commit retry after audit report content repair then blocks no-delta retry`

Each blocked-case test should assert no `tool:result` exists for the blocked call, and should inspect `repeated_tool_loop_blocked` metadata.

## Risk controls

- Do not change provider retry/fallback behavior except preserving fail-closed suppression.
- Do not alter stage caps.
- Do not relax `stageErrorHandler` user-safe messaging.
- Avoid broad refactors in the runtime adapter.
- Keep unrelated dirty files unstaged and unmodified.
