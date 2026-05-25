# Research - Remote Audit Quality Trust Canary

## Task Framing And Lane

- Task ID: `work-20260525-remote-audit-quality-trust-canary`.
- Lane: `work`.
- Intake card: `docs/intake/work/work-20260525-remote-audit-quality-trust-canary.md`.
- RDPI needed: yes.
- Task type: diagnostic and validation-only remote audit-quality canary.
- Target: deployed AIF service at `http://192.168.88.67/api`.
- Explicit exclusions: no local AIF service, no loopback browser target, no local e2e runtime, no local service validation. The remote/e2e boundary is also documented in `docs/kb/runtime-endpoint-leases.md:22`.
- Preflight: `codex-ensure-rdpi.py` returned `STATUS: ready`; `codex-flow-audit.py --repo .` returned `STATUS: clean`.

## Accepted Planning Sources Or Local Facts

- The intake card requires a negative scenario where weak or fabricated evidence cannot produce trusted `validated_no_findings`, a positive scenario where a ledger-backed committed artifact can produce trusted pass if supported, and a final result that classifies the system as fixed, trust-boundary blocked, or runtime-saturation blocked.
- The external independent review records the predecessor canary failure on `192.168.88.67`: fabricated or misleading evidence, invalid report manifest, bad/missing file references, uncommitted report artifact, low-quality evidence, malformed structured review, and `manualReviewRequired=true` after review iteration 2 (`operator-supplied external review file aif-independent-code-review-6713a389.md:23`).
- The same review identified the trust boundary as the primary gap: report text, manifest, evidence ledger, git/source snapshot, committed artifact, roadmap artifact DB state, review sidecar text, and synthesis metadata must converge into one lifecycle (`operator-supplied external review file aif-independent-code-review-6713a389.md:51`).
- The same review recommended trust-boundary hardening over prompt changes: ledger-only trusted artifacts, committed-blob lifecycle, and trusted-source-only synthesis propagation (`operator-supplied external review file aif-independent-code-review-6713a389.md:1223`).
- `docs/kb/audit-evidence-provenance-contract.md:12` defines the target trust boundary: markdown prose is presentation/compatibility input, while trusted conclusions require a declared audit plan, bound source snapshot, runtime-captured evidence units, and deterministic classifier rules.
- `docs/kb/audit-evidence-provenance-contract.md:112` requires every material conclusion to cite evidence unit IDs when the ledger exists, fail closed on stale snapshots or missing evidence, and treat prose alone as insufficient proof.
- `docs/kb/audit-evidence-provenance-contract.md:184` defines the target source-report lifecycle and allows current compatibility states such as `valid`, `invalid`, `missing`, and `external_blocked` during migration.
- `packages/api/src/routes/tasks.ts:343` exposes `GET /tasks/:id/timeline`, `packages/api/src/routes/tasks.ts:355` exposes `GET /tasks/:id/artifact-trust`, and `packages/api/src/routes/tasks.ts:363` exposes `GET /tasks/:id/evidence`.
- `packages/api/src/routes/tasks.ts:504` creates tasks through `POST /tasks`; audit tasks force `skipReview=false` and `useSubagents=true` around `packages/api/src/routes/tasks.ts:557`.
- `packages/api/src/routes/tasks.ts:1084` applies human task events through `POST /tasks/:id/events` and broadcasts timeline/trust updates.
- `packages/api/src/routes/projects.ts:468` and `packages/api/src/routes/projects.ts:512` expose roadmap generation/import surfaces, but this task should use the smallest remote validation path that still exercises trusted audit artifacts.
- `packages/shared/src/auditReportValidator.ts:238` defines validation outputs including `issueCodes`, `blockingIssues`, `repairMode`, `validationFingerprint`, artifact/content hashes, manifest state, and source snapshot.
- `packages/shared/src/auditReportValidator.ts:3694` computes sorted issue codes, blocking issues, repair mode, and stable validation fingerprint.
- `packages/shared/src/auditReportValidator.ts:3745` verifies audit artifact lifecycle, and `packages/shared/src/auditReportValidator.ts:3843` requires `draft_written`, `manifest_finalized`, `validator_passed`, `git_committed`, and `committed_blob_revalidated` before `artifact_state_valid`.
- `packages/shared/src/taskCompletionEvidence.ts:1321` makes trusted audit proof require validator ok, valid manifest, trusted source classification, explicit ledger evidence, artifact lifecycle ok, and committed validation ok.
- `packages/shared/src/taskCompletionEvidence.ts:1628` keeps legacy text evidence diagnostic-only in trusted artifact mode: only `trustedAuditArtifact` can satisfy substantive trusted evidence there.
- `packages/data/src/index.ts:6538` builds the artifact-trust rollup, exposing `artifactTrustLevel`, `reasonCodes`, `trustedSynthesisInput`, `nextAction`, `failureSignature`, lifecycle-derived metadata, and batch counts.
- `docs/rdpi/work/work-20260525-ledger-only-audit-completion-evidence/result.md` records that trusted audit completion now requires manifest-valid, ledger-backed, committed audit artifacts with valid lifecycle evidence and committed blob revalidation.
- `docs/rdpi/work/work-20260525-trusted-audit-artifact-lifecycle/result.md` records lifecycle issue codes such as `audit_artifact_uncommitted` and `committed_blob_mismatch`.
- `docs/rdpi/work/work-20260525-trusted-source-audit-synthesis/result.md` records that trusted synthesis requires typed source records, valid source classification, and committed source proof, and that mutated accepted source reports become blockers rather than no-findings evidence.
- `docs/rdpi/work/work-20260525-audit-validation-fingerprint-guard/result.md` records stable validation fingerprints, sorted issue codes, blocking issues, and deterministic repair-mode routing for repeated validator failures.
- `docs/rdpi/work/work-20260525-typed-structured-review-errors/result.md` records fail-closed structured review parsing with stable issue codes and fingerprints for malformed structured review output.
- `docs/rdpi/work/work-20260525-distributed-runtime-endpoint-leases/result.md` records DB-backed runtime endpoint leases and fail-closed lease heartbeat behavior; this is relevant to distinguishing audit trust failures from runtime saturation/backpressure.

## Same-Project Memory

- Not recalled before `PLAN PASS`. This is a live-validation/audit task, and the RDPI contract forbids shared-memory recall before `PLAN PASS` unless the user explicitly waives that boundary.
- After `PLAN PASS`, shared-memory status was reachable with no pending or failed items, and same-project recall confirmed the deployed service anchor: UI `http://192.168.88.67/`, API `http://192.168.88.67/api`, host `ubuntu@192.168.88.67`, host repo `/opt/aif-handoff`, and project roots under `/srv/aif-handoff/projects` mounted as `/home/www`.
- No recalled memory overrode local task facts, RDPI artifacts, or remote API evidence.

## Cross-Project Reusable Patterns

- Not recalled before `PLAN PASS` for the same reason. Local repo facts and local task history are sufficient for planning.

## Rejected Or Stale Memory Candidates

- No memory candidates were read, so none were accepted or rejected.

## Planning Hypotheses

- H1: A remote-only API-driven canary can exercise the deployed pipeline without starting local service components by creating/polling audit tasks through `http://192.168.88.67/api`.
- H2: A direct narrow audit task is sufficient for the negative scenario because the completion evidence and artifact-trust rollup should reject missing/invalid manifest, fake evidence refs, bad file refs, missing ledger evidence, uncommitted artifacts, or malformed review before trusted pass.
- H3: A positive trusted pass may require a roadmap-backed audit artifact, because task completion evidence receives `roadmapBatchId` and audit artifact role from the roadmap batch artifact record in coordinator paths.
- H4: If the deployed service cannot produce a positive trusted artifact, that is not a canary success. The result should classify the task as blocked by trust boundary or runtime saturation based on remote status, reason codes, and artifact trust output.
- H5: The most important output is not only task status. The canary must record machine-readable issue codes, validation fingerprint or failure signature, lifecycle states, `trustedSynthesisInput`, and `nextAction`.
