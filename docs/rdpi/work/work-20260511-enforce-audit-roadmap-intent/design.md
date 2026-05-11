# Design: Enforce Audit Roadmap Intent

Task: `work-20260511-enforce-audit-roadmap-intent`

## Goal

Prevent audit roadmap runs from silently degrading into generic implementation roadmaps when the user or UI sends `taskIntent: "general"` or omits the intent.

## Contract

An audit-shaped roadmap request must either:

- explicitly use `taskIntent: "audit"`, or
- fail before generation/import with a clear validation error.

The system must not auto-convert to audit on the backend because silent correction hides UI/API mistakes. The user should see that the request contract is inconsistent.

## Audit-Shaped Signals

Use narrow signals for fail-closed behavior:

- exact audit run aliases: `audit`, `audit-v6`, `audit_v6`, `audit.6`, `audit-20260511`, `audit_20260511`
- explicit audit-only vision language such as `only audit`, `audit only`, `diagnostic audit`
- explicit Russian audit-only phrases represented in code/tests with Unicode escapes to avoid mojibake:
  - `\u0442\u043e\u043b\u044c\u043a\u043e \u0430\u0443\u0434\u0438\u0442`
  - `\u043d\u0435 \u0438\u0441\u043f\u0440\u0430\u0432\u043b\u044f\u0442\u044c \u043a\u043e\u0434`

Do not treat broad product/feature terms as audit run aliases:

- `audit-logging`
- `security-review`
- `tests`
- `coverage`
- `build`
- `add-checkout`
- alias `audit-logging` with vision `add audit logging`

## Implementation Shape

Add a pure helper in `packages/api/src/services/roadmapGeneration.ts`:

- normalize the requested roadmap intent using the existing intent resolver
- detect whether the alias or vision is audit-shaped
- throw `RoadmapGenerationError("ROADMAP_INTENT_MISMATCH", ...)` when the request is audit-shaped but the resolved intent is not `audit`

Apply the helper:

- in `generateRoadmapFile` before prompting the runtime
- in `generateRoadmapTasks` after loading the roadmap file and before generic extraction
- in `importGeneratedTasks` before generic import coercion
- in the HTTP generate/import routes before returning `202` or starting import, so the UI gets immediate feedback

The route catches the validation error and returns `400` with:

```json
{
  "error": "...",
  "code": "ROADMAP_INTENT_MISMATCH"
}
```

## Tests

Add focused coverage for:

- `POST /projects/:id/roadmap/generate` rejects `roadmapAlias: "audit-v6"` with `taskIntent: "general"` and does not start runtime generation.
- `POST /projects/:id/roadmap/import` rejects `roadmapAlias: "audit-v6"` with `taskIntent: "general"`.
- `generateRoadmapFile` rejects `audit-v6` as general before runtime execution.
- `generateRoadmapTasks` rejects `audit-v6` as general before runtime extraction.
- `importGeneratedTasks` rejects an audit-shaped generated batch when batch intent is missing/general.
- `generateRoadmapFile` rejects audit-only vision with non-audit intent before runtime execution.
- `POST /projects/:id/roadmap/generate` rejects audit-only vision with non-audit intent and does not start runtime generation.
- Russian audit-only phrases are covered via Unicode-escaped test inputs.
- Existing generic typed-looking alias tests remain green.

## Non-Goals

- Do not delete or mutate existing live `audit-v6` cards as part of the code fix.
- Do not change the audit roadmap decomposition model in this task.
- Do not change the task creation defaults for ordinary generic roadmap imports.
