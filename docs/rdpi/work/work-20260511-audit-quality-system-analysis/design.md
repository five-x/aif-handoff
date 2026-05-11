# Design - Audit Quality System Analysis

## Goals

- Replace repeated regex-only fixes with an explicit audit report quality contract.
- Decompose the platform fix into implementation cards that can be completed independently.
- Keep the fix project-wide for any registered project that AIF audits.
- Preserve usage/cost accounting for external providers while avoiding paid-spend assumptions for local model retries.

## Non-goals

- Do not edit or validate the canary project directly in this decomposition run.
- Do not execute the child implementation tasks in the same run.
- Do not rely on reviewer prompts as the primary enforcement layer.
- Do not create a DB migration unless an implementation task proves one is needed.

## Proposed task split

### 1. Audit Report Contract Validator

Create one shared validator for audit report artifacts. It should parse or structurally inspect the report and return typed issues such as:

- placeholder or synthetic git verification, including short numeric placeholders like `1234567`;
- contradictory findings plus `No validated findings`;
- missing required fields for accepted findings;
- speculative/unverified wording in findings;
- non-actionable governance/documentation observations presented as technical findings;
- fake command output or command output that contradicts repository state where deterministic checks are possible.

This task should move the quality bar out of scattered prompts and broad regex lists.

### 2. Audit Scope Coverage Contract

Parse declared audit scope from task descriptions and require the report to include a coverage matrix or equivalent evidence for every explicit scope root. For directories, the report must cite representative concrete files and commands under that directory, not only the directory path.

The goal is to reject a report that cites only `README.md`, `AGENTS.md`, and `pyproject.toml` when the task scope includes `src` and `src/bot_intevra`.

### 3. Rework State And Freshness Contract

Fix the coordinator rework path so `request_changes` cannot be bypassed by stale completion evidence. A reopened report task should run the implementer unless the system can prove the rework comment was already addressed after the rework request timestamp.

Candidate mechanisms:

- store artifact content SHA and validated timestamp;
- compare the latest report commit/content after the rework request;
- treat latest human/agent rework comment as a freshness boundary;
- do not clear `reworkRequested` or mark the artifact valid without a fresh validation record tied to that boundary.

### 4. Review Gate Evidence Unification

Make the review gate consume the shared audit report validator and convert validator issues into blocking findings. Review sidecars can add findings, but they should not be able to accept an artifact the deterministic validator rejects.

This aligns review, completion guard, approve-time checks, and roadmap batch artifact state with one validator result.

### 5. Audit Batch Integration Canary

Add platform-level integration coverage for the full typed audit batch lifecycle with a deterministic or mocked tool-capable runtime:

- weak report becomes invalid/rework-needed;
- manual `request_changes` forces actual rework;
- valid report artifact marks the batch source valid;
- synthesis waits until all source artifacts are terminal and only consumes validated reports;
- local runtime token reporting does not become paid cost, while external-provider cost accounting remains intact.

## Ordering

1. Implement validator core first, because later tasks should reuse it.
2. Add scope coverage next, because it explains why structurally valid doc-only reports are still unacceptable.
3. Fix rework freshness, because it directly caused the observed manual rework skip.
4. Unify review gate with the validator.
5. Add integration canary after the contracts stabilize.

## Risk analysis

- A stronger validator can initially block more audit reports. That is intended for audit quality; the blocked reason must be actionable.
- Scope coverage should not require exhaustive line-by-line coverage for large directories. It should require representative inspected files plus command evidence for each declared scope root.
- Rework freshness must not force meaningless empty commits. A no-change closure can be valid only if it explicitly addresses the rework request and passes validator checks.
- Integration tests should use a deterministic or mocked runtime path to avoid making test success depend on a local Qwen model.
- Token accounting should remain observability, not a blocker, for local runtimes. External provider costs and budget caps must remain enforced where adapters support them.

## Done when all child tasks are complete

- The observed bad report fixture fails deterministically.
- A valid no-findings report with scope coverage passes.
- A valid findings report with concrete product evidence passes.
- Manual rework cannot be skipped without fresh artifact validation after the rework boundary.
- Review gate, completion guard, approve flow, and roadmap batch state all agree on report validity.
- Synthesis does not consume invalid report artifacts as validated source findings.
