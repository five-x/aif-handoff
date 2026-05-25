# Research: Trusted Source Audit Synthesis

## Task Framing And Lane

- Task ID: `work-20260525-trusted-source-audit-synthesis`
- Lane: `work`
- Intake card: `docs/intake/work/work-20260525-trusted-source-audit-synthesis.md`
- RDPI needed: yes
- Request: make audit synthesis consume trusted source audit artifact records instead of raw report content or semi-trusted artifact text.
- Close-out boundary: this is an implementation task, not an audit-only task. Do not create or run child tasks in this RDPI run.

## Accepted Planning Sources Or Local Facts

- `docs/intake/work/work-20260525-trusted-source-audit-synthesis.md`: required source reports that are invalid, untrusted, missing, or `source_inconclusive` must block trusted `validated_no_findings`; reason codes must identify the blocking source artifact.
- `docs/intake/work_status.json`: prerequisite tasks `work-20260525-trusted-audit-artifact-lifecycle` and `work-20260525-ledger-only-audit-completion-evidence` are marked `done`.
- `packages/shared/src/auditSynthesisClassifier.ts`: current `AuditSynthesisSourceReport` input is raw `content` plus metadata, and `classifyAuditSynthesisSourceReports()` revalidates raw content before aggregating synthesis outcomes.
- `packages/data/src/index.ts`: current data trust predicates already require strict artifact lifecycle evidence, committed blob revalidation, valid manifest status, trusted evidence depth, and trusted public source classifications before report artifacts count as valid synthesis inputs.
- `packages/data/src/index.ts`: `listRoadmapReportArtifactsForSynthesis()` returns trusted valid reports plus terminal non-trusted reports for synthesis context, so deterministic synthesis can distinguish trusted contributors from terminal blockers.
- `packages/agent/src/subagents/implementer.ts`: deterministic synthesis currently reads valid artifact content from source branches/worktrees, summarizes weak artifacts separately, and calls `classifyAuditSynthesisSourceReports()` with raw report content and `weakReportCount`.
- `packages/shared/src/taskCompletionEvidence.ts`: completion classification already invokes `classifyAuditSynthesisOutput()` for synthesis artifacts and verifies artifact lifecycle during completion.
- `packages/shared/src/__tests__/auditSynthesisClassifier.test.ts`: focused classifier tests exist but currently assert raw-content behavior rather than a typed trusted source artifact contract.
- `packages/data/src/__tests__/index.test.ts` and `packages/data/src/__tests__/planBRegression.test.ts`: data tests already cover valid, invalid, missing, `source_inconclusive`, terminal, and manual-exception artifact rollups.

## Same-Project Memory

- Not queried before `PLAN PASS`. RDPI rules prohibit shared-memory recall before plan approval for this implementation run unless explicitly waived.
- Local curated memory files surfaced by repository search support the same direction: prior deltas state `source_inconclusive` remains terminal non-trusted, audit synthesis classification lives in `auditSynthesisClassifier`, and data-layer roadmap trust lives in `validationDetailsHaveTrustedAuditSourceClassification()`, `roadmapArtifactCountsAsValid()`, and synthesis selectors.

## Cross-Project Reusable Patterns

- None used. The relevant behavior is project-specific and local code/docs are authoritative.

## Rejected Or Stale Memory Candidates

- No shared-memory candidates were accepted. Any prior claim that raw markdown revalidation alone is sufficient is stale for this task because the intake requires a typed trusted artifact boundary and committed-source trust propagation.

## Research Findings

- Main gap: `classifyAuditSynthesisSourceReports()` can still be called with raw strong prose and no artifact trust proof. This conflicts with the task's trusted-source boundary.
- Existing data trust checks are a usable source of truth: report artifacts only count as valid when lifecycle proof and trusted source classification are present.
- Required-vs-optional source membership is not currently modeled in the data schema. The implementation should treat batch reports as required by default and allow explicit non-required/excluded records only in the shared classifier contract.
- Public outcome names must remain unchanged: `validated_findings_present`, `validated_no_findings`, and `source_inconclusive` remain the effective synthesis outcomes.
- Reason-code propagation can be additive: extend `AuditSynthesisOutcome` with blocker details without renaming outcome kinds.

## Open Questions

- No blocker. The conservative interpretation is that existing roadmap source artifacts are required unless a typed classifier input explicitly marks a source as non-required/excluded.
