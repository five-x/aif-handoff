# Research: Roadmap Repeat Blocker Hardening

## Problem

New audit runs can immediately recreate the same operational failure shape after cards are cleared. The operator observed duplicate/repeated audit cards and fast `blocked_external` outcomes on fresh audit aliases.

## Pre-Implementation Local Facts

- Before this task, `packages/api/src/routes/projects.ts` started `/roadmap/generate` as a background job after a preflight alias check. There was no process-local in-flight guard, so two rapid requests for the same project + alias could both start before tasks or batch rows existed.
- Before this task, `packages/api/src/services/roadmapGeneration.ts` rejected reused audit aliases by existing tasks only. If roadmap batch rows remained after task deletion, the alias/history check could become blind.
- Before this task, `packages/data/src/index.ts` `deleteTask()` deleted only the task row and comments. It did not delete `roadmap_batch_artifacts`, `roadmap_batch_artifact_attempts`, or empty `roadmap_batches`, leaving stale audit registry rows after operator cleanup.
- Before this task, `packages/agent/src/subagents/implementer.ts` already treated first-run non-repairable generated audit scope as `operator_input_required` with `manualReviewRequired=false`, but repeated/final deterministic audit guards still set `manualReviewRequired=true`.
- Current v18 live card failure text matches an older implementation log for non-repairable scope, so rollout drift must be verified during deploy. SSH key access is currently denied from this Codex session, while the HTTP API is reachable.

## Risk Classes

- Duplicate import race: repeated generate/import requests before the first job creates tasks.
- Stale audit registry: clearing tasks leaves orphan batch/artifact state that can pollute later audit context and alias checks.
- Opaque blocked cards: generated audit report failures become manual-review dead ends instead of actionable operator-input holds.
- Deploy drift: local `main` and running containers may diverge if deploy cannot be verified through SSH.
