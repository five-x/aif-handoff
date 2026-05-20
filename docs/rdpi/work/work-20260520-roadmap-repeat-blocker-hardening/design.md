# Design: Roadmap Repeat Blocker Hardening

## Goal

Make roadmap audit creation and cleanup idempotent enough that a new audit run cannot immediately fail due stale metadata, duplicate in-flight requests, or non-actionable manual-review blockers.

## Decisions

1. Add a server-side in-flight guard for roadmap generate/import keyed by normalized `projectId + roadmapAlias`. The second request returns `409 ROADMAP_ALIAS_IN_PROGRESS` before starting runtime work.
2. Treat existing roadmap batch rows as alias history, not only existing task rows. Alias reuse should fail when stale batch metadata remains.
3. Make task deletion clean roadmap-owned rows for that task. Artifact attempts and task artifact rows are deleted; empty roadmap batches are deleted. Remaining non-empty batches are refreshed.
4. For generated audit report deterministic final/repeated guards, preserve non-green `blocked_external` and artifact `source_inconclusive`, but use `operator_input_required:` and `manualReviewRequired=false` so the card asks for concrete input instead of becoming a manual-review dead end.
5. Add regression tests at API/data/agent levels so the future failure modes are covered outside helper-only unit tests.

## Non-Goals

- Do not mark weak or inconclusive audit reports as trusted success.
- Do not weaken OTZ acceptance gates.
- Do not add broad schema rewrites in this slice.
