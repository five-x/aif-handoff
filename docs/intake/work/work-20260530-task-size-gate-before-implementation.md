# Task Size Gate Before Implementation

- Task ID: work-20260530-task-size-gate-before-implementation
- Lane: work
- Status: done
- Priority: critical
- Created: 2026-05-30
- Source: operator request after a broad scaffold/dev-stack child entered implementation and exhausted the local runtime.
- RDPI Needed: yes
- RDPI Path: docs/rdpi/work/work-20260530-task-size-gate-before-implementation

## Request

Add a deterministic task-size gate before any task can enter implementation.

The gate must reject broad, vague, or multi-area implementation cards and require them to be split into smaller executable children with concrete file boundaries, acceptance checks, and expected verification commands.

## Problem

The blocked `zai-mi.com` child combined application skeleton, local dev stack, and baseline configuration into one executable card. That scope was too broad for a local tool-using implementer and allowed an expensive runtime loop before the system discovered the card was not small enough.

## In Scope

- Pre-implementation validation for task size and specificity.
- Required implementation manifest fields before `implementing` starts.
- Limits for expected changed file groups, major subsystems, verification surface, and ambiguity.
- API/coordinator behavior when a card fails the size gate.
- Tests for broad scaffold cards, narrow implementation cards, and roadmap-created children.

## Out Of Scope

- Model runtime routing.
- Automatic implementation of split children.
- Broad redesign of roadmap planning beyond the minimum contract needed by the gate.

## Acceptance Criteria

- A task like "skeleton application, local dev stack, and base configuration" is rejected before implementation unless already split into atomic children.
- The rejection is operator-readable and names the missing split dimensions.
- Narrow tasks with concrete files, acceptance criteria, and verification commands still pass.
- The gate is deterministic; it does not rely only on model self-assessment.
- Tests prove the gate blocks generic/broad implementation plans before any implementer runtime is started.

## Done When

- No executable card can enter implementation without passing the task-size contract.
- The roadmap/hierarchy flow receives a clear split-required status instead of starting a doomed implementation run.
- `npm run format:check`, `npm run lint`, `npm run test`, and `npm run build` pass or any pre-existing unrelated failures are documented.
