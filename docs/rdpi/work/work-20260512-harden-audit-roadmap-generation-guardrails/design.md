# Design: Harden Audit Roadmap Generation Guardrails

Task: `work-20260512-harden-audit-roadmap-generation-guardrails`

## Goal

Make audit roadmap guardrails a deterministic platform contract rather than prompt-only guidance.

## Contract Changes

Add shared canonical audit text in `packages/shared/src/auditRoadmapContract.ts`:

- report no-findings proof guardrail that explicitly rejects `git ls-files`, `git status`, directory listings, file-existence checks, and broad inventory-only observations as sufficient no-findings proof.
- report substantive no-findings requirement describing concrete scoped-file inspection, commands, observed outputs, and why scoped risks are absent.
- synthesis outcome requirement requiring exactly one of:
  - validated findings present
  - validated no-findings with substantive evidence
  - audit inconclusive

Extend `validateGeneratedAuditCard` so audit cards fail when these canonical guardrails are missing. Keep the existing legacy issue message for marker failures; add new stable issue codes/messages for missing no-findings and synthesis guardrails.

## API Roadmap Generation Changes

Update `packages/api/src/services/roadmapGeneration.ts` to:

- reuse the shared canonical guardrail text in deterministic audit card construction and prompt examples.
- distinguish report cards from synthesis cards when building deterministic audit roadmaps.
- preserve prior inconclusive audit context, when detected, by adding a `Prior audit context:` line to every generated audit card.
- detect prior inconclusive audit context generically from alias, vision, description, architecture, or source roadmap text when those contain audit/inconclusive language.
- reject source audit roadmaps before import when a roadmap-level prior inconclusive audit context is present but cards do not carry that context.
- validate generated audit batches through the shared audit-card validator so direct imports cannot bypass canonical guardrails.

## Non-Goals

- No changes to audit artifact schemas, batch lifecycle, synthesis pause behavior, dedupe keys, task scheduling, or runtime completion gates.
- No project-specific detection or hardcoded live audit labels.
- No child implementation tasks.

## Risk Management

- Centralizing guardrail text in shared code reduces prompt/test drift.
- Source markdown validation and generated batch validation both fail closed.
- Fixture-style service tests cover prompt/fallback, source validation, deterministic conversion, and direct import validation.
