# Add Structured Audit Report Manifest And Snapshot Binding

- Task ID: work-20260512-structured-audit-report-manifest
- Lane: work
- Status: done
- Priority: high
- Created: 2026-05-12
- Due: unset
- Source: audit evidence provenance review
- RDPI Needed: yes
- RDPI Path: docs/rdpi/work/work-20260512-structured-audit-report-manifest

## Request

Introduce a structured source audit report manifest and source snapshot binding so markdown remains the human presentation layer while machine validation reads explicit outcome, scope, risk, snapshot, evidence, and content hash fields.

The goal is to remove prose inference as the primary source of audit truth and make every report validation say which source state it validated against.

## Done When

- Source audit reports can include a versioned structured manifest block.
- Manifest fields include report version, audit plan id, source snapshot id or equivalent commit/tree binding, outcome, scope coverage, risk hypotheses, findings, no-findings claims, and evidence references.
- Validation fails closed when manifest ids contradict task, batch, source snapshot, artifact path, or content SHA.
- Legacy markdown-only reports remain supported only under stricter downgrade rules.
- Source line references are validated against the intended snapshot semantics, not an ambiguous current worktree state.
- Batch artifact validation details persist manifest version, content SHA, and snapshot binding.

## Constraints

- Follow RDPI before implementation.
- Do not execute this task during intake.
- Design snapshot semantics carefully for branch restoration, task commits, and dirty report artifacts.
- Do not require the full runtime evidence ledger in the first manifest rollout, but leave a clean extension point for evidence ids.

## Notes

- Current batch artifacts persist branch name, worktree path, project root, content SHA, and validation details, but not a source snapshot id.
- Current report validator checks filesystem paths under `projectRoot`, which can differ from the source state that the report originally inspected.

## Links

- Parent architecture intake: work-20260512-audit-evidence-provenance-contract
- Related intake: work-20260512-audit-evidence-ledger
