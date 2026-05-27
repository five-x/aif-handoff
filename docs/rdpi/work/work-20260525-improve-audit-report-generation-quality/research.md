# Research: Raise Audit Report Generation Quality After Trust Boundary Hardening

## Task framing and lane

- Task ID: `work-20260525-improve-audit-report-generation-quality`.
- Lane: `work`.
- Priority: `critical`.
- RDPI needed: yes.
- Source commit: `772ba2df08b5725decdbbeff15e7676fee6b1ba9`.
- Goal: improve audit report production quality after trust-boundary hardening, without weakening the fail-closed validator, lifecycle gate, ledger requirement, or trusted synthesis contract.
- Boundary before `PLAN PASS`: planning-only. No local AIF service, remote service, scheduler, worker-report, live endpoint, log, or shared-memory probing was performed.

## Accepted planning sources or local facts

- `AGENTS.md` requires Node commands through `npm.cmd`, keeps `docs/rdpi/` as task history, and says local repo facts outrank memory recall.
- `docs/ops/external-audit-handoff-20260525.md:16` records distributed runtime endpoint leases as implemented.
- `docs/ops/external-audit-handoff-20260525.md:18` records that a deliberately bad remote audit-quality canary was rejected fail-closed.
- `docs/ops/external-audit-handoff-20260525.md:67` starts the known weak spots section.
- `docs/ops/external-audit-handoff-20260525.md:71` states the generator can still write a bad audit report and positive report quality still needs improvement.
- `docs/ops/external-audit-handoff-20260525.md:72` records observed scope drift: the negative canary requested `README.md`, but the deterministic plan used `config` and `tests`.
- `docs/ops/external-audit-handoff-20260525.md:73` records observed dirty residue: the implementer produced an uncommitted report artifact during the negative canary.
- `docs/rdpi/work/work-20260525-trusted-audit-artifact-lifecycle/result.md` records that `verifyAuditArtifactLifecycle()` was added and that trusted reports require committed blob revalidation plus clean artifact state.
- `docs/rdpi/work/work-20260525-ledger-only-audit-completion-evidence/result.md` records that trusted completion now requires manifest-valid, ledger-backed, committed artifacts and that legacy text/prose evidence is diagnostic only.
- `docs/rdpi/work/work-20260525-trusted-source-audit-synthesis/result.md` records that raw legacy report content is kept out of trusted synthesis contribution paths and typed trusted source records are required.
- `docs/rdpi/work/work-20260525-typed-structured-review-errors/result.md` records typed parse errors, deterministic fingerprints, repair instructions, first-malformed rework, and repeated-fingerprint manual review.
- `docs/rdpi/work/work-20260525-audit-validation-fingerprint-guard/result.md` records stable audit validation fingerprints and repeated-fingerprint deterministic route handling.
- `docs/rdpi/work/work-20260525-distributed-runtime-endpoint-leases/result.md` records DB-backed leases, shared cooldowns, heartbeat renewal, and lease injection through bootstrap/API/agent/subagent paths.
- `docs/rdpi/work/work-20260525-remote-audit-quality-trust-canary/result.md` includes a remote negative canary that blocked with issue codes including `uncommitted_report_artifact`, `invalid_report_manifest`, `low_quality_report_evidence`, `manual_review_required`, `fake_or_placeholder_command_output`, and `missing_report_file_references`.
- `docs/rdpi/work/work-20260525-clear-remote-botintevra-dirty-audit-worktree/result.md` records manual backup-before-delete cleanup of untracked remote audit artifacts and confirms the final container worktree was clean.

## Source facts

- `packages/agent/src/subagents/implementer.ts:1104` formats available audit evidence ledger entries for the report writer, including evidence ID, tool, snapshot, scope, risks, command, and preview.
- `packages/agent/src/subagents/implementer.ts:1187` builds the audit report manifest prompt contract.
- `packages/agent/src/subagents/implementer.ts:1232` instructs the report writer to select `validated_findings_present`, `validated_no_findings`, or `source_inconclusive`.
- `packages/agent/src/subagents/implementer.ts:1233` instructs the writer to cite exact full ledger evidence IDs and not invent `ev_*` IDs.
- `packages/agent/src/subagents/implementer.ts:1234` requires no-findings reports to tie absence claims to runtime ledger evidence.
- `packages/agent/src/subagents/implementer.ts:1235` forbids command output blocks unless the same output is present in `AUDIT_EVIDENCE_LEDGER`.
- `packages/agent/src/subagents/implementer.ts:1236` requires `scopeCoverage[].root` to be one of the declared scope roots and covered by exact path:line citations.
- `packages/agent/src/subagents/implementer.ts:1565` parses declared audit scope roots from a `Scope:` line.
- `packages/agent/src/subagents/implementer.ts:3535` starts deterministic audit report repair; it writes the artifact, commits it if changed, then validates.
- `packages/agent/src/subagents/implementer.ts:3553` validates deterministic repair output with task context.
- `packages/agent/src/subagents/implementer.ts:3571` verifies lifecycle after deterministic repair.
- `packages/agent/src/subagents/implementer.ts:3592` promotes the roadmap artifact to `valid` only after strict validation and lifecycle pass.
- `packages/agent/src/subagents/implementer.ts:3826` records `source_inconclusive` artifact state for terminal non-trusted reports.
- `packages/agent/src/subagents/implementer.ts:4937` builds source-audit scope discipline prompt text.
- `packages/agent/src/subagents/implementer.ts:4991` tells the writer to finalize from existing ledger evidence or mark `source_inconclusive` after repository-inspection budget warnings.
- `packages/shared/src/auditReportValidator.ts:30` includes `fake_or_placeholder_command_output` as a validation issue.
- `packages/shared/src/auditReportValidator.ts:37` includes `missing_scope_coverage` as a validation issue.
- `packages/shared/src/auditReportValidator.ts:107` and `packages/shared/src/auditReportValidator.ts:108` include lifecycle issue codes `audit_artifact_uncommitted` and `committed_blob_mismatch`.
- `packages/shared/src/auditReportValidator.ts:3167` exports `validateAuditReportArtifact()`.
- `packages/shared/src/auditReportValidator.ts:3233` computes ledger-backed no-findings evidence.
- `packages/shared/src/auditReportValidator.ts:3248` assesses evidence depth with scope and ledger context.
- `packages/shared/src/auditReportValidator.ts:3740` exports `verifyAuditArtifactLifecycle()`.
- `packages/shared/src/auditReportValidator.ts:3767`, `3796`, and `3827` emit uncommitted and committed-blob lifecycle issues.
- `packages/shared/src/taskCompletionEvidence.ts:89` defines `AuditTrustMode = "diagnostic" | "trusted_artifact"`.
- `packages/shared/src/taskCompletionEvidence.ts:1276` resolves trusted mode for audit/report/synthesis or roadmap contexts.
- `packages/shared/src/taskCompletionEvidence.ts:1419` exports `evaluateTaskCompletionEvidence()`.
- `packages/shared/src/taskCompletionEvidence.ts:1542` requires artifact lifecycle for completion when trusted artifact mode, audit roles, or roadmap batches apply.
- `packages/shared/src/taskCompletionEvidence.ts:1615` still computes legacy substantive report evidence for diagnostics.
- `packages/shared/src/taskCompletionEvidence.ts:1623` computes trusted audit artifact proof.
- `packages/shared/src/taskCompletionEvidence.ts:1630` uses trusted proof, not legacy text, in trusted mode.
- `packages/shared/src/taskCompletionEvidence.ts:1778` emits `missing_audit_evidence_ref` if trusted mode lacks ledger enablement.
- `packages/shared/src/taskCompletionEvidence.ts:1794` emits `legacy_text_evidence_untrusted` when legacy text evidence exists but trusted proof is absent.
- `packages/shared/src/auditSynthesisClassifier.ts:78` accepts typed `trustedSourceArtifacts`.
- `packages/shared/src/auditSynthesisClassifier.ts:214` maps legacy raw reports to blocking artifacts.
- `packages/shared/src/auditSynthesisClassifier.ts:228` exports `classifyAuditSynthesisSourceReports()`.
- `packages/shared/src/auditSynthesisClassifier.ts:235` includes raw legacy reports as blockers.
- `packages/shared/src/auditSynthesisClassifier.ts:243` filters typed trusted artifacts through `sourceArtifactIsTrusted()`.
- `packages/shared/src/auditSynthesisClassifier.ts:328` returns inconclusive when required source artifacts are blocked.
- `packages/shared/src/auditSynthesisClassifier.ts:352` returns inconclusive when no trusted source audit artifacts are available.
- `packages/agent/src/reviewGate.ts:1175` builds structured parse error findings preserving fingerprint and issue codes.
- `packages/agent/src/reviewGate.ts:1199` builds structured parse error decisions.
- `packages/agent/src/reviewGate.ts:1235` routes repeated structured parse error findings to manual review.
- `packages/agent/src/reviewGate.ts:1245` routes first structured parse errors to request changes.
- `packages/agent/src/autoReviewHandler.ts:381` detects stalled repeated blockers and routes to manual review.
- `packages/runtime/src/bootstrap.ts:24` accepts an injected runtime endpoint lease store.
- `packages/runtime/src/bootstrap.ts:43` passes the lease store into the qwen-local-agent adapter.
- `packages/agent/src/index.ts:13` creates an agent-process DB runtime endpoint lease store with an agent holder ID.
- `packages/api/src/services/runtime.ts:59` creates an API-process DB runtime endpoint lease store with an API holder ID.
- `packages/agent/src/subagentQuery.ts:480` creates a subagent query DB runtime endpoint lease store with a distinct holder ID.
- `packages/runtime/src/adapters/qwenLocalAgent/api.ts:47` defines `endpoint_queue_timeout` as a provider status.
- `packages/runtime/src/adapters/qwenLocalAgent/api.ts:53` and `:65` define protected local endpoint budgets for `8003` and `8005`.
- `packages/runtime/src/adapters/qwenLocalAgent/api.ts:1416` logs lease acquisition with holder ID, wait, and TTL.
- `packages/runtime/src/adapters/qwenLocalAgent/api.ts:1520` logs endpoint lease waiting with holder/cooldown context.
- `packages/runtime/src/adapters/qwenLocalAgent/api.ts:1649` persists shared cooldown through the lease store for transport/timeout failures.

## Existing tests relevant to this task

- `packages/shared/src/__tests__/auditReportValidator.test.ts` already covers missing scope coverage, fake output, invalid manifests, source snapshots, and evidence quality.
- `packages/shared/src/__tests__/taskCompletionEvidence.test.ts` already covers trusted vs diagnostic mode, legacy text evidence, uncommitted artifacts, committed blob mismatch, and trusted artifact proof.
- `packages/shared/src/__tests__/auditSynthesisClassifier.test.ts` already covers trusted typed artifacts and legacy/raw report blockers.
- `packages/agent/src/__tests__/implementer.test.ts` already covers deterministic audit repair, source inconclusive terminalization, synthesis with trusted artifacts, and scope-related prompt behavior.
- `packages/agent/src/__tests__/reviewContract.test.ts` and `packages/agent/src/__tests__/reviewGate.test.ts` already cover typed structured review parse issues and repeated fingerprints.
- `packages/runtime/src/__tests__/qwenLocalAgent.test.ts` already covers endpoint lease contention, queue timeout, shared cooldown, heartbeat loss, and 8003/8005 endpoint keys.

## Same-project memory

- Shared-memory recall was not used before `PLAN PASS` because the RDPI skill forbids shared-memory recall before the plan gate unless the user explicitly waives that boundary.
- Same-project local RDPI/result documents listed above were used as local documentation, not as live memory recall.

## Cross-project reusable patterns

- No cross-project memory was queried before `PLAN PASS`.
- A reusable pattern from local prior RDPI tasks is accepted: fail closed, preserve exact reason codes, require independent gates, and prefer deterministic artifacts over prose-only prompts.

## Rejected or stale memory candidates

- No shared-memory candidates were inspected.
- Existing local notes that describe the trust boundary as "fully solved" are not accepted for this task. The current handoff explicitly narrows the remaining problem to generation quality and operational cleanup.

## Hypotheses for design

- H1: Generation quality will improve more from a structured report writer contract and deterministic scaffolding than from adding another long list of negative prompt rules.
- H2: Scope drift should be blocked before trust promotion by explicit declared-scope coverage checks and, where feasible, writer-visible allowed evidence lists keyed by scope root.
- H3: Fake command output is best reduced by feeding the writer exact ledger IDs, command metadata, output preview/hash, and an allowed citation list; if a needed output is absent, the report should be `source_inconclusive`.
- H4: Dirty artifact residue needs a coordinator/implementer cleanup hook after terminal blocked/inconclusive runs, with backup-before-remove and validation details recording.
- H5: Production call-site safety likely depends on documenting and testing all `evaluateTaskCompletionEvidence`, `validateAuditReportArtifact`, `verifyAuditArtifactLifecycle`, `classifyAuditSynthesisSourceReports`, and `updateRoadmapBatchArtifactState` paths rather than trusting convention.
- H6: Remote positive canary must be fresh enough to prove the current generator can produce a trusted report, not only that an older trusted control still exists.
