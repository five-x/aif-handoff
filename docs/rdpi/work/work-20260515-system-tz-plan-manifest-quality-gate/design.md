# Design

## Approach

Extend the existing plan-quality guard instead of adding a parallel validation system. `packages/shared/src/planQuality.ts` remains the deterministic source of truth; the agent plan-checker remains the enforcement point before implementation.

The implementation will add a strict JSON fenced block parser for `aif-plan-manifest`. New full-mode tasks require one valid manifest. Non-full tasks do not require a manifest for compatibility, but any present manifest is validated fail-closed.

## Rollout boundary

The manifest requirement must not unexpectedly terminalize existing in-flight full-mode tasks that were planned before this contract. The validator should distinguish:

- `manifest required`: `plannerMode: "full"` and the task was created at or after the rollout cutoff, or the task is an older full-mode task that has been sent back through replanning with plan-quality feedback under this contract.
- `manifest optional`: fast-mode plans, non-full plans, and pre-rollout full-mode plans that have not been intentionally replanned under the new contract.

For `manifest optional` tasks, absence of the block is allowed but a present block is still validated fail-closed. This preserves old accepted plans while ensuring newly generated full-mode plans carry the manifest.

## Manifest contract

The manifest block is:

````md
```aif-plan-manifest
{
  "version": 1,
  "taskId": "task-id",
  "intent": "feature",
  "scope": ["packages/shared/src/planQuality.ts"],
  "allowedChanges": ["source", "tests"],
  "forbiddenChanges": ["secrets", "unrelated modules"],
  "expectedArtifacts": [
    { "kind": "source_diff", "paths": ["packages/shared/src/planQuality.ts"] }
  ],
  "acceptanceCriteria": [
    {
      "id": "ac-1",
      "description": "The plan-quality gate rejects full-mode plans without manifests.",
      "verification": "npm.cmd test --workspace=@aif/shared -- --run src/__tests__/planQuality.test.ts"
    }
  ],
  "verificationCommands": [
    "npm.cmd test --workspace=@aif/shared -- --run src/__tests__/planQuality.test.ts"
  ]
}
```
````

```

Validation rules:

- Require exactly parseable JSON with `version: 1`.
- For manifest-required tasks, require the block. For manifest-optional tasks, validate it only when present.
- When `task.id` is available, require `manifest.taskId` to match it.
- Require `manifest.intent` to match explicit or inferred task intent.
- Require non-empty explicit `scope`.
- Require non-empty `expectedArtifacts`.
- Require non-empty acceptance criteria with stable ids, descriptions, and non-placeholder verification text.
- Require non-empty verification commands with command-like text, rejecting `n/a`, `none`, `todo`, and placeholders.
- Require `allowedChanges` to be consistent with `TASK_INTENT_CONTRACTS[intent].policy.allowedChanges.categories`.
- Reject forbidden policy categories in `allowedChanges`, especially audit/docs/spike/test conversion into source-changing implementation.
- Keep existing diagnostic audit checks active so a manifest cannot override report-only boundaries.

## Replan feedback

The coordinator should persist structured plan-quality feedback in `agentActivityLog` on every plan-quality failure. The existing human-readable blocked reason stays intact for operator readability, while a compact JSON line records the attempt, max retries, categories, and issue messages.

The retry policy remains:

- first failure: replan with structured feedback
- second failure: stricter replan feedback
- third failure: `blocked_external` and `manualReviewRequired=true`

Roadmap source-report terminalization keeps its existing source-inconclusive path, already manual-review-required.

## UI

Add a small plan-quality presentation helper in web components. It should detect blocked reasons that start with `Plan quality guard`, render a `PLAN QUALITY` badge, and show a focused alert with retry/blocker text even when the task status is `planning`, not only when `blocked_external`.

This avoids a schema migration and still exposes the result and blocker reason from the existing source of truth.

## Prompt integration

Update planner context so full-mode plans are explicitly asked to include the manifest block. Add planner tests that inspect the produced prompt and verify full-mode prompt requirements plus fast-mode compatibility. Update the plan-checker prompt so LLM normalization preserves or adds the manifest and returns the full plan.

## Verification strategy

- Shared tests for manifest presence, valid manifest-required full-mode task, pre-rollout full-mode compatibility, task id mismatch, intent mismatch, invalid allowed changes, missing acceptance criteria verification, missing verification commands, invalid optional manifest on fast-mode plans, and deterministic diagnostic fallback manifest output.
- Agent tests for full-mode plan-checker rejection without a manifest, existing full-mode task compatibility before rollout, old task manifest requirement after plan-quality replanning, fallback plans that include valid manifests, and planner prompt production requirements.
- Coordinator tests for structured activity feedback and non-roadmap manual-review-required terminal blocking.
- Web tests for plan-quality display in card/detail header.
- Focused commands first, then build/lint.
```
