<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

# Repository Guidelines

This file is compiled from global and project GPTI sources.

## Layering

- Global source root: `C:\Users\apron\.codex\gpti`
- Project source root: `C:\Users\apron\source\aif-handoff\.codex\gpti`

## Project Summary

<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

# Project Identity

- Project: aif-handoff
- Preset: node
- Description: Node.js or TypeScript repository.

# Working Agreements

- Keep repository-specific runtime guidance in this file and in `.codex/gpti/profiles/`.
- Keep long-lived operational knowledge in `docs/kb/` and `docs/ops/`.
- Keep reusable memory artifacts in `docs/memory/`.

# Commands

- Build: npm.cmd run build
- Test: npm.cmd test
- Lint: npm.cmd run lint
- Run: npm.cmd run dev

# Rollout and Migrations

- Record rollout notes and migration procedures in `docs/ops/runbook.md`.
- Keep environment-specific secrets outside the repository and outside shared memory.

# Documentation

- `docs/rdpi/` is the task history source of truth.
- `docs/kb/` stores validated project knowledge.
- `docs/intake/` stores intake decomposition artifacts.

## Preset Profiles

### Node

<!-- Managed by codex-platform; edit source GPTI/templates and re-run the compiler. -->

# Preset Profile

- Preset: node
- Description: Node.js or TypeScript repository.

# Known Pitfalls

- Keep package manager choice explicit in AGENTS.md and docs/ops/runbook.md.

# Command Overrides

- Build: npm.cmd run build
- Test: npm.cmd test
- Lint: npm.cmd run lint
- Run: npm.cmd run dev

## Real Commands

- Build: `npm.cmd run build`
- Test: `npm.cmd test`
- Lint: `npm.cmd run lint`
- Run: `npm.cmd run dev`

## Memory And Secrets

- Local repo facts outrank memory recall.
- Same-project curated memory outranks cross-project reusable memory.
- Shared-memory-first is not the default for repo/task-specific questions.
- For repo/task-specific work, establish the current task, local repo state, and local docs first.
- For explicit historical, prior-decision, or past-solution questions, use same-project curated memory first, then cross-project reusable memory, and fall back to local docs only if memory is insufficient.
- If memory is empty, stale, or conflicting, say that explicitly and do not let it override local facts.
- Publish only curated non-secret knowledge into shared memory.
- Keep raw secrets in the separate secret layer.

## Documentation

- `docs/rdpi/` is the task history source of truth.
- `docs/intake/` stores intake artifacts.
- `docs/ops/` stores rollout and runbook material.
- `docs/kb/` stores validated project knowledge.
- `docs/memory/` stores curated memory candidates and capsules.

## Git And Approvals

- Keep changes diffable and auditable.
- Prefer controlled patching over manual drift.
- Do not publish memory artifacts before review.
