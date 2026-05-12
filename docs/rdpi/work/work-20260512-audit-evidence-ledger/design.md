# Design: Audit Evidence Ledger

## Chosen design

Introduce a separate audit evidence ledger instead of expanding `agentActivityLog`.

The first implementation adds:

- a shared `AuditEvidenceUnit` model and normalizer for bounded evidence capture;
- an append-only `audit_evidence_events` SQLite table with task, audit plan, source snapshot, scope IDs, risk hypothesis IDs, kind, grade, hashes, previews, command metadata, and parsed summary JSON;
- data-layer append/list helpers;
- runtime capture for read/search/shell evidence through agent-side Claude hooks and runtime event metadata where available;
- validator support that can verify manifest `evidenceRefs` against a ledger context.

Evidence previews are redacted and bounded. Raw outputs are never persisted. Raw content can contribute SHA-256 hashes, but stored previews and summaries are safe, small, and reviewable.

## Evidence classification

Evidence kinds:

- `file_read`
- `search`
- `shell_command`

Evidence grades:

- `discovery`: inventory, listing, existence, git status/log, or other evidence that can guide inspection but cannot prove no-findings.
- `substantive`: scoped inspection output that may support a finding or no-findings claim when the report also covers scope/risk requirements.

Inventory shell commands are always downgraded to `discovery`, including `git ls-files`, `git status`, `git log`, `ls`, `dir`, `find`, `Get-ChildItem`, `Get-Item`, `test -e`, `test -f`, `Test-Path`, and bracket existence checks. They cannot be promoted by report prose.

## Validator behavior

`validateAuditReportArtifact` will accept optional ledger evidence. When provided and a manifest cites evidence IDs, the validator checks that each cited ID:

- exists in the ledger context;
- belongs to the same task ID when task ID is known;
- belongs to the expected audit plan ID;
- belongs to the manifest/expected source snapshot ID;
- covers the manifest claim's scope IDs when the claim declares scope binding;
- covers the manifest claim's risk hypothesis IDs when the claim declares risk binding;
- is not discovery-only when the manifest claims `validated_no_findings`.

The validator stays API-compatible for markdown-only callers that do not supply ledger context. Production completion/artifact validation paths will load and pass ledger context for audit report tasks, and ledger-backed no-findings manifests fail closed when evidence IDs are missing, mismatched, or do not cover the declared scope/risk IDs. That makes fake markdown command output insufficient once a manifest declares ledger evidence.

## Runtime capture boundary

The activity log remains concise and response-free. Ledger capture is separate:

- Claude SDK PostToolUse hook input is inspected in memory and converted to a bounded ledger unit for `Read`, `Grep`/search, and `Bash` when response metadata is available.
- Qwen local agent emits a bounded `audit:evidence` runtime event for `read_file`, `list_files`, `run_shell`, and `git_status`; the agent persists those events with task context.
- Generic runtimes that only expose `tool:use` without output remain activity-only until they expose a bounded result event.
- Task completion and artifact-state validation call sites query the ledger by task/audit plan/source snapshot and pass those units into shared validation. Shared code receives evidence as input to avoid importing the data layer.

## Pre-PLAN boundary

Before `PLAN PASS`, only task framing, local file inspection, source reading, and RDPI artifact edits are allowed. Implementation edits, tests, runtime/service checks, worker-report reads, shared-memory recall, and live validation wait until after the independent plan gate.

## Decision candidates

- Evidence ledger entries are append-only, bounded, and redacted.
- General task activity logging remains a concise timeline and never stores full tool responses.
- Inventory evidence is discovery-grade and cannot prove no-findings.
- Manifest evidence IDs become the compatibility bridge until first-class audit plan/source snapshot tables exist.
- Scope and risk IDs are first-class ledger bindings, not prose-only annotations.
