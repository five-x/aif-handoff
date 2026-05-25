# Research: Trusted Audit Artifact Lifecycle

## Task framing and lane

- Task ID: `work-20260525-trusted-audit-artifact-lifecycle`
- Lane: `work`
- Intake source: `docs/intake/work/work-20260525-trusted-audit-artifact-lifecycle.md`
- RDPI path: `docs/rdpi/work/work-20260525-trusted-audit-artifact-lifecycle`
- Task type: implementation.
- Planning boundary: before independent `PLAN PASS`, this artifact records only task framing, local static source facts, scope boundaries, hypotheses, and proposed verification. No local AIF service, local browser, e2e, scheduler/log probing, worker-report inspection, live endpoint check, downstream runtime/config read, or shared-memory recall was performed.

The requested trust lifecycle is explicit and fail-closed:

- `draft_written`
- `manifest_finalized`
- `validator_passed`
- `git_committed`
- `committed_blob_revalidated`
- `artifact_state_valid`

The core acceptance requirement is that roadmap artifact validity cannot come from a worktree-only markdown report. After commit, validation must re-read the committed artifact blob, equivalent to `git show HEAD:<artifactPath>`, validate that committed content, and only then permit roadmap-valid artifact state.

## Accepted planning sources or local facts

- `AGENTS.md` and `.agents/skills/rdpi/SKILL.md` require RDPI, independent `PLAN PASS`, coder delegation after plan approval, independent `TEST PASS`, independent final `REVIEW PASS`, and `$memsync MODE=auto` before RDPI-backed close-out.
- `.agents/skills/runtask/SKILL.md` requires `codex-ensure-rdpi.py` preflight, `codex-flow-audit.py --repo .`, running only the selected intake card, and updating only the matching status entry after success.
- `python "$env:USERPROFILE\.codex\tools\codex-ensure-rdpi.py"` returned `STATUS: refreshed`.
- `python "$env:USERPROFILE\.codex\tools\codex-flow-audit.py" --repo .` returned `STATUS: clean`.
- `docs/kb/audit-evidence-provenance-contract.md` defines markdown reports as compatibility inputs, not authoritative proof. Trusted report conclusions require audit plan, source snapshot, evidence ledger, manifest, and deterministic classifier binding.
- `packages/shared/src/auditReportValidator.ts:20` defines audit report validation issue codes. Current codes cover manifest, ledger, and source snapshot failures, but not `audit_artifact_uncommitted` or `committed_blob_mismatch`.
- `packages/shared/src/auditReportValidator.ts:71` defines `AuditReportValidationInput`; it validates text supplied by the caller and has no committed-blob input.
- `packages/shared/src/auditReportValidator.ts:159` returns `artifactSha256`, `contentSha256`, `manifestStatus`, `sourceSnapshot`, and classifier data.
- `packages/shared/src/auditReportValidator.ts:2907` performs manifest, ledger, scope, source snapshot, quality, and evidence-depth validation against the supplied text.
- `packages/shared/src/taskCompletionEvidence.ts:36` defines top-level task-completion issue codes and currently includes `uncommitted_report_artifact`, but not the requested hard code `audit_artifact_uncommitted`.
- `packages/shared/src/taskCompletionEvidence.ts:368` collects dirty and committed files from git status/diff.
- `packages/shared/src/taskCompletionEvidence.ts:598` reads report text from the worktree.
- `packages/shared/src/taskCompletionEvidence.ts:1422` validates that worktree report text using `validateAuditReportArtifact`.
- `packages/shared/src/taskCompletionEvidence.ts:1523` blocks uncommitted report artifacts during completion, but the result still does not revalidate a committed blob.
- `packages/shared/src/taskCompletionEvidence.ts:2179` through `packages/shared/src/taskCompletionEvidence.ts:2335` already test untracked, dirty, staged, and committed report-artifact behavior for committed-report tasks.
- `packages/shared/src/taskCompletionEvidence.ts:4624` through `packages/shared/src/taskCompletionEvidence.ts:4776` already test missing ledger, manifest/hash mismatch, and missing manifest completion failures.
- `packages/shared/src/auditRoadmapContract.ts:1` defines audit artifact roles and states. Existing persisted artifact states are coarse (`expected`, `valid`, `invalid`, `missing`, etc.) and do not include the requested lifecycle states.
- `packages/shared/src/auditRoadmapContract.ts:124` maps completion evidence issue codes to audit failure families. New lifecycle hard codes should map to integrity/contract failures without weakening existing mappings.
- `packages/shared/src/schema.ts:197` and `packages/shared/src/schema.ts:229` show roadmap artifacts and attempts already store `validationDetailsJson`, `contentSha`, branch/worktree/project root, and attempt metadata. This provides a low-risk place to persist typed lifecycle evidence without a schema migration.
- `packages/data/src/index.ts:5440` through `packages/data/src/index.ts:5497` currently allow trust predicates from manifest status, evidence depth, source classification, and `state === "valid"`; they do not require committed-blob lifecycle proof.
- `packages/data/src/index.ts:6666` updates roadmap artifact state and attempts from caller-provided `state`, `validationDetails`, and `contentSha`.
- `packages/agent/src/coordinator.ts:2266` evaluates task completion evidence and `packages/agent/src/coordinator.ts:2288` promotes audit artifacts to `state: "valid"` directly from `result.ok`.
- `packages/api/src/services/taskEvents.ts:760` evaluates completion evidence and `packages/api/src/services/taskEvents.ts:790` promotes audit artifacts to `state: "valid"` directly from `result.ok`.
- Explorer subagent `019e5bd7-ee19-7a80-af3d-5e888dac6d69` independently confirmed the likely touchpoints: shared validator/evidence, agent/API promotion paths, data trust predicates, and source/data tests.

## Same-project memory

- Shared-memory recall was not used before `PLAN PASS` because the repository RDPI contract forbids shared-memory recall during planning unless explicitly waived.
- Local curated docs in the repository were treated as local docs only where read directly. The accepted planning source was `docs/kb/audit-evidence-provenance-contract.md`.

## Cross-project reusable patterns

- No cross-project memory was queried before `PLAN PASS`.
- The local reusable pattern is already documented in this repo: fail closed when completion evidence can be claimed by generated prose without a deterministic artifact/provenance contract.

## Rejected or stale memory candidates

- No shared-memory candidates were evaluated before `PLAN PASS`.
- Markdown report prose is explicitly rejected as a trusted substitute for manifest, ledger, source snapshot, validator pass, git commit state, or committed blob validation.
- A worktree-clean report is insufficient for the requested trust contract unless the committed blob is read and revalidated.

## Implementation hypotheses

- H1: The narrowest shared boundary is a new shared audit artifact lifecycle verifier that accepts the worktree validation result plus artifact path/project root/context, checks path-specific git commit state, reads `HEAD:<artifactPath>`, validates that blob text, compares artifact/content hashes, and returns typed lifecycle evidence plus hard issue codes.
- H2: The existing database schema can carry lifecycle evidence in `validationDetailsJson`, avoiding a migration while still making roadmap trust predicates require distinct lifecycle evidence.
- H3: `evaluateTaskCompletionEvidence()` should expose lifecycle evidence and block completion with `audit_artifact_uncommitted` or `committed_blob_mismatch`; agent/API valid promotions should persist only lifecycle-verified evidence.
- H4: Data-layer trust predicates must require `artifact_state_valid` lifecycle evidence before `state: "valid"` counts for reports or synthesis input; otherwise hand-authored validation details could still bypass the lifecycle.
