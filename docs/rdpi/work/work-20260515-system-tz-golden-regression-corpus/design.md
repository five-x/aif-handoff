# Design: System TZ Golden Regression Corpus

## Chosen design

Create a deterministic System TZ golden regression corpus alongside the existing shared validator tests. The implementation will reuse the current audit contract fixture repo, add exact System TZ case IDs, and add a development-corpus harness that feeds plan, implementation, review-closure, task-intent, and permission mutations through the existing validators.

The design keeps the corpus test-first and fail-closed:

- Audit report cases reuse `validateAuditReportArtifact`, `classifyAuditSynthesisSourceReports`, and `selectAuditArtifactFailureFamily`.
- Development cases use `evaluateTaskCompletionEvidence`, `validateImplementationManifest`, `evaluateTaskPlanQuality`, and `decideShellPermission`.
- Data/runtime cases use deterministic package-local tests for workflow timeline rollup, memory redaction, and runtime resolution. These are required coverage targets, not conditional stretch checks.
- Mutation cases alter evidence refs, source snapshots, command/test output, changed files, acceptance criteria, and review closure proof, then assert validator failure codes.
- Any validator gap found by the corpus is hardened narrowly instead of weakening fixtures.

The only expected production validator change is to require passed implementation verification evidence to include output identity (`outputSha256` and `outputPreview`). This aligns implementation manifests with the existing audit evidence trust model and makes "tests ran" claims falsifiable.

## Pre-PLAN boundary

Allowed before `PLAN PASS`:

- Read the immutable intake card, local instructions, local docs, local memory files, and static source/test files.
- Run RDPI preflight and flow audit.
- Write planning-only `research.md`, `design.md`, and `plan.md`.

Not allowed before `PLAN PASS`:

- Source or test implementation changes.
- Running verification commands as evidence.
- Live service checks, endpoint probes, scheduler reads, worker-report reads, log inspection, downstream runtime/config reads, or shared-memory recall.

## Scope boundaries

In scope after `PLAN PASS`:

- `packages/shared/src/implementationManifest.ts`
- Shared tests/fixtures under `packages/shared/src/__tests__/`
- Narrow data tests under `packages/data/src/__tests__/` for memory redaction and workflow timeline corpus targets
- Narrow runtime or data tests for runtime resolution corpus targets, depending on the existing package boundary that owns the target behavior
- RDPI result and local memory-review artifacts

Out of scope:

- Live server evidence
- Schema migrations
- API/UI/MCP behavior changes
- New generic workflow persistence
- Weakening any validator to make fixtures pass
- Executing or creating child implementation tasks

## Decision candidates

- Golden corpus fixtures should stay deterministic, redacted, and local-only.
- Passed verification evidence should carry output identity, not only a command string.
- Rework-without-delta is distinct from review blocker closure; corpus coverage must prove both stale/no-delta rework and unclosed blockers fail.
