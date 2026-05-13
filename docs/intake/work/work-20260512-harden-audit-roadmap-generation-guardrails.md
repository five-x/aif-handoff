# Harden Audit Roadmap Generation Guardrails

- Task ID: work-20260512-harden-audit-roadmap-generation-guardrails
- Lane: work
- Status: done
- Priority: high
- Created: 2026-05-12
- Due: unset
- Source: follow-up from live Audit v8 card correction after audit inconclusive synthesis gate rollout
- RDPI Needed: yes
- RDPI Path: docs/rdpi/work/work-20260512-harden-audit-roadmap-generation-guardrails

## Request

Harden audit roadmap generation and import so audit-shaped roadmap requests preserve canonical audit guardrails in generated task descriptions without manual post-editing.

The observed failure class is Audit v8 generation: the generated tasks were correctly created as a typed audit batch with report artifacts and a paused synthesis card, but the descriptions did not preserve the explicit `audit-v7` inconclusive context, the substantive no-inventory proof requirements, or the synthesis outcome requirements until they were manually corrected after creation.

## Done When

- Audit roadmap generation prompt and deterministic audit item construction include canonical guardrails for substantive no-findings evidence.
- Generated audit report cards explicitly reject `git ls-files`, `git status`, directory listings, file-existence checks, and broad inventory-only observations as sufficient proof for a no-findings conclusion.
- Generated synthesis cards include explicit outcome requirements for validated findings present, validated no-findings with substantive evidence, and audit inconclusive.
- Audit-shaped aliases, vision text, or source roadmap context that mention prior inconclusive audits are preserved in report and synthesis task descriptions.
- Audit roadmap source/task validation rejects missing canonical guardrails before import, instead of accepting structurally valid but substantively weak audit task text.
- Regression coverage includes a v8-like roadmap request and verifies generated report and synthesis descriptions carry the required context and outcome language.
- The change is platform-level and project-agnostic; future audit roadmaps do not require manual correction for the same class of omission.

## Constraints

- Follow RDPI before implementation.
- Do not execute this task during intake.
- Do not create child implementation tasks in the same run.
- Preserve existing typed audit batch metadata, artifact creation, paused synthesis behavior, and roadmap dedupe semantics.
- Do not special-case `botIntevra`, Audit v8, branch names, task IDs, or specific live project paths.
- Prefer deterministic validators and fixture-based tests over prompt-only wording.
- Do not weaken existing audit completion evidence, review, or synthesis gates.

## Notes

- Likely implementation surface includes `packages/api/src/services/roadmapGeneration.ts` and related roadmap generation/import tests.
- Existing live Audit v8 cards were manually corrected; this task is to make future generation correct by default.

## Links

- Related completed work: ../../rdpi/work/work-20260511-audit-inconclusive-synthesis-gate
