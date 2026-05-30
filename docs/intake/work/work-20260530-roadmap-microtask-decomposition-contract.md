# Roadmap Microtask Decomposition Contract

- Task ID: work-20260530-roadmap-microtask-decomposition-contract
- Lane: work
- Status: done
- Priority: critical
- Created: 2026-05-30
- Source: operator request to decompose project implementation work into the smallest practical tasks after `zai-mi.com` child implementation blocked.
- RDPI Needed: yes
- RDPI Path: docs/rdpi/work/work-20260530-roadmap-microtask-decomposition-contract

## Request

Harden roadmap generation and split flows so executable children are microtasks with narrow implementation boundaries.

Roadmap planning may describe broad phases, but cards that can enter implementation must be small enough for a tool-using agent to complete, verify, and review independently.

## Problem

The `zai-mi.com` roadmap created a child for application skeleton, local dev stack, and baseline configuration. That child should have been split into multiple smaller cards before implementation, such as repository bootstrap, package scripts, Docker/dev services, config schema, CI checks, and smoke verification.

## In Scope

- Roadmap child-generation contract for atomic executable tasks.
- Split validation for broad scaffold/dev-stack/configuration items.
- Dependency ordering between generated microtasks.
- Tests using a `zai-mi.com`-like spec to prove broad work becomes multiple executable children.
- Operator-visible split rationale when a broad child is rejected.

## Out Of Scope

- Implementing the generated project itself.
- Changing business requirements for `zai-mi.com`.
- Replacing task-size gates; this task complements them.

## Acceptance Criteria

- A broad project scaffold phase is decomposed into multiple small implementation cards before any child can run.
- Each executable child has a concrete outcome, bounded file/surface area, acceptance checks, and dependency metadata.
- The system rejects monolithic executable children whose scope spans unrelated setup, config, infrastructure, and app code.
- Tests prove roadmap generation and manual split proposal paths follow the same microtask contract.
- Existing roadmap phase summaries remain possible, but only non-executable parent tasks may stay broad.

## Done When

- Roadmap-generated work cannot produce a broad executable child like the blocked `zai-mi.com` card.
- Microtask decomposition behavior is covered by regression tests.
- `npm run format:check`, `npm run lint`, `npm run test`, and `npm run build` pass or any pre-existing unrelated failures are documented.
