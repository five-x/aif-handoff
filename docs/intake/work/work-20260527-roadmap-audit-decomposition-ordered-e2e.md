# Roadmap Audit Decomposition Ordered E2E

- Task ID: work-20260527-roadmap-audit-decomposition-ordered-e2e
- Lane: work
- Status: queued
- Priority: critical
- Created: 2026-05-27
- Due: unset
- Source: User request after direct audit canary planner/routing trusted-path proof
- RDPI Needed: yes
- RDPI Path: docs/rdpi/work/work-20260527-roadmap-audit-decomposition-ordered-e2e
- Target branch: codex/roadmap-audit-oom-hardening
- Remote validation target: http://192.168.88.67/api

## Request

Implement roadmap-level broad audit decomposition so a broad audit request is turned into a strict, ordered set of scoped audit child cards and a final synthesis card. The workflow must continue through remote-only e2e validation until it proves a final trusted outcome, not just individual direct audit canary success.

The target behavior is:

```text
broad audit request
-> decomposition quality gate
-> ordered child audit cards with explicit contracts
-> child execution through trusted audit artifact lifecycle
-> parent gating over child outcomes
-> final synthesis from trusted child outputs only
-> remote-only e2e proof of final result
```

## Done When

- Broad audit requests are classified as `decomposition_required` instead of being routed as one broad direct audit card.
- Roadmap decomposition produces multiple scoped child audit cards with deterministic contracts:
  - `taskIntent=audit`
  - declared scope roots
  - `expectedReportArtifactPath`
  - `allowedWritePaths` limited to the expected report artifact
  - dependency/order metadata
  - acceptance criteria
  - trusted artifact lifecycle requirements
- The child-card dependency model supports a strict order or DAG and blocks final synthesis until required child cards are terminal.
- Each child audit routes through the direct audit trusted-artifact path proven by `work-20260525-unblock-direct-audit-canary-planner-routing`.
- Parent synthesis consumes only trusted child reports or explicit terminal inconclusive outcomes with machine-readable issue codes.
- Parent synthesis rejects missing, untrusted, dirty, stale, or raw-text child report evidence fail-closed.
- The UI/API/timeline surfaces the decomposition tree, child order, child trust states, and final synthesis state clearly enough for an operator to audit the run.
- A fresh remote-only e2e run on `http://192.168.88.67/api` proves:
  - broad audit request decomposes into at least three scoped child cards;
  - child cards execute in the expected dependency order;
  - trusted child reports are committed and revalidated;
  - final synthesis reaches `done` or accepted trusted terminal state;
  - final source classification is `validated_no_findings` or `validated_findings_present`;
  - remote target worktree ends clean.

## Required Negative E2E

Add and run a remote-only negative e2e scenario proving fail-closed behavior when decomposition or child evidence is invalid.

The negative run should cover at least one of:

- broad audit missing usable scope;
- child card missing expected report artifact;
- child report untrusted or source inconclusive;
- final synthesis attempts to consume raw/untrusted child report text;
- child dependency skipped or executed out of order.

Expected outcome:

```text
blocked_external or operator_input_required
trusted final synthesis: false
precise machine-readable issue codes
no raw report text accepted as trusted evidence
remote worktree clean after cleanup
```

## Required Positive E2E

Add and run a remote-only positive e2e scenario using a small stable scope set.

Recommended first scope:

```text
README.md
docs/ops/audit-trust-callsite-map-20260525.md
docs/ops/external-audit-handoff-20260525.md
```

Expected outcome:

```text
decomposition_created=true
child_count >= 3
all required child cards terminal
trusted child reports accepted
final synthesis trusted
artifact_state_valid=true
committed_blob_revalidated=true
sourceClassification=validated_no_findings or validated_findings_present
remote worktree clean
```

## Tests To Add Or Verify

- Unit tests for broad audit classification and decomposition-required routing.
- Planner/decomposer tests for deterministic child scope, artifact path, allowed write path, dependency order, and acceptance criteria.
- Plan-checker tests rejecting generic broad plans, missing scope, missing child artifact, source-code-fix plans, local AIF validation, and missing synthesis gate.
- Coordinator/roadmap tests proving child cards route to `workflowKind=audit` and final synthesis waits for trusted child outcomes.
- Audit writer/reviewer tests proving child contracts are enforced and raw/untrusted child text is rejected.
- Synthesis classifier/completion-evidence tests proving final trusted state is derived only from trusted child artifacts.
- Remote-only e2e tests using:

```text
AIF_SKIP_DEV_SERVER=1
AIF_WEB_URL=http://192.168.88.67
AIF_API_URL=http://192.168.88.67/api
```

## Verification Commands

Local source gates:

```bash
npm.cmd test
npm.cmd run lint
npm.cmd run build
git diff --check
```

Targeted gates expected during implementation:

```bash
npm.cmd test --workspace=@aif/agent -- planner planChecker coordinator implementer reviewer reviewGate
npm.cmd test --workspace=@aif/shared -- auditReportValidator taskCompletionEvidence auditSynthesisClassifier planQuality
npm.cmd test --workspace=@aif/api -- tasks
```

Remote-only gates:

```bash
curl http://192.168.88.67/api/health
```

Record exact remote task IDs, project IDs, child card IDs, artifact paths, issue codes, lifecycle states, commit SHAs, validation fingerprints, and final remote worktree status.

## Constraints

- Follow RDPI strictly before implementation.
- Do not execute this task during intake.
- Do not create or execute child implementation tasks in the same run that only creates this intake card.
- Do not weaken `auditReportValidator`, completion evidence, manifest checks, source snapshot checks, ledger-only trusted mode, or committed blob lifecycle.
- Do not accept raw report text as trusted synthesis evidence.
- Do not use localhost, local AIF service, local browser, or local e2e as final validation proof.
- Preserve the narrow direct audit behavior proven by `work-20260525-unblock-direct-audit-canary-planner-routing`.
- Do not stage, edit, commit, format, or include `docs/kb/windows-codex-bootstrap-validation.md`.

## RDPI Execution Instruction

When this task is explicitly started, use:

```text
Research -> Design -> Plan -> independent PLAN PASS -> Implementation -> Tests -> independent TEST PASS -> independent REVIEW PASS -> Handoff
```

Before `PLAN PASS`, do not perform live runtime probing beyond allowed planning sources unless the operator explicitly asks to run the task now.

## Links

- Depends on: work-20260525-unblock-direct-audit-canary-planner-routing
- Related prior work: work-20260513-split-broad-audit-requests-into-micro-report-cards
- Related prior work: work-20260513-enforce-hierarchy-rollup-runtime-gates
- Related prior work: work-20260525-trusted-source-audit-synthesis
