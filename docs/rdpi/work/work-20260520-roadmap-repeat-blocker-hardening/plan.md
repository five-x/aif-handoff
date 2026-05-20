# Plan: Roadmap Repeat Blocker Hardening

1. Update roadmap generation/import routes with an in-flight alias lock and `409 ROADMAP_ALIAS_IN_PROGRESS` response. The lock must be released in `finally` after both success and failure. Because this is process-local, it is a single-API-process safety guard, not a cross-process distributed lock.
2. Update audit alias reuse logic to reject aliases with existing roadmap batch rows, even when task rows were deleted.
3. Update `deleteTask()` cleanup to delete roadmap artifact attempts/artifacts for the task and remove empty batches.
4. Normalize repeated/final generated audit report terminalization to operator-input holds (`manualReviewRequired=false`) while preserving `source_inconclusive` artifact state.
5. Add regression tests:
   - route-level duplicate generate request returns `409` while the first job is active, and a later request can proceed after the first job releases the lock;
   - deleting roadmap tasks removes stale batch/artifact state;
   - reused audit alias is rejected by stale batch metadata, while deleting all owning roadmap tasks removes the empty batch so cleanup is not a permanent alias tombstone;
   - repeated/final deterministic audit guard does not set manual review and remains fail-closed: task status stays `blocked_external`, artifact stays `source_inconclusive`, and no weak/inconclusive audit output is marked valid or done.
6. Run targeted tests, build/lint as feasible, then commit/push/deploy. If SSH remains unavailable, report deploy as blocked by public-key auth.
