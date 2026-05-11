# Research: Enforce Audit Roadmap Intent

Task: `work-20260511-enforce-audit-roadmap-intent`
Date: 2026-05-11

## Problem

Audit-style roadmap requests can currently enter the platform with `taskIntent: "general"`.
When that happens, the roadmap generation and import path treats the run as a generic implementation roadmap and creates implementation-shaped cards instead of diagnostic audit cards.

This matters for the product as a whole, not for auditing `aif-handoff` specifically. A high-level quality audit request must be decomposed into rigorous owner-area checks, evidence requirements, and report artifacts without requiring the user to write a detailed audit spec in the roadmap prompt.

## Accepted Local Evidence

- `packages/web/src/components/layout/RoadmapDialog.tsx` initializes `taskIntent` as `"general"` and forwards the selected intent to generate/import calls.
- `packages/api/src/routes/projects.ts` accepts `roadmapAlias`, optional `taskIntent`, and optional `vision`; it rejects reused audit aliases only when the request already says `taskIntent === "audit"`.
- `packages/api/src/services/roadmapGeneration.ts` resolves missing or invalid roadmap intent to `"general"`.
- Generic roadmap extraction coerces parsed tasks to `taskIntent: "general"` even if the model returns typed-looking tasks.
- Audit roadmap generation has a deterministic audit path, but it is reachable only when the request intent is explicitly `audit`.
- Existing tests intentionally keep broad typed-looking aliases such as `audit-logging`, `security-review`, `tests`, and `coverage` generic when there is no explicit intent. The fix must preserve these cases.

## Accepted Symptom From Prior User-Requested Live Check

Before this RDPI run, the user asked to inspect the newly created `audit-v6` cards. The observed server state showed six `audit-v6` cards with `taskIntent: "general"`, `kind:general` tags, implementation-shaped titles, `skipReview: true`, and no audit report contract. Server logs showed the request was accepted as `taskIntent: "general"` despite an audit-style alias.

No additional live probing was performed during this research phase.

## Independent Explorer Findings

The explorer confirmed:

- The API route is the best fail-closed point because background generation returns `202`; late service errors would be less visible to the user.
- Service-level guards are also useful because generation/import functions can be called outside the HTTP route.
- Vision-only detection must be conservative to avoid blocking ordinary feature roadmaps about audit logging or security review.
- Alias `audit-v6` is a strong signal and should require `taskIntent: "audit"`.

## Constraints

- Do not infer every occurrence of the word `audit` as audit intent.
- Preserve generic behavior for feature aliases like `audit-logging`.
- Preserve the explicit audit deterministic roadmap path.
- Fail closed with a clear machine-readable error when an audit-shaped request is submitted as non-audit.
- Avoid live runtime checks until after `PLAN PASS`.
