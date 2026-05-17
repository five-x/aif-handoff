# Plan

```aif-plan-manifest
{
  "version": 1,
  "taskId": "work-20260515-system-tz-plan-manifest-quality-gate",
  "intent": "feature",
  "scope": [
    "packages/shared/src/planQuality.ts",
    "packages/shared/src/__tests__/planQuality.test.ts",
    "packages/agent/src/subagents/planChecker.ts",
    "packages/agent/src/subagents/planner.ts",
    "packages/agent/src/coordinator.ts",
    "packages/agent/src/__tests__/planChecker.test.ts",
    "packages/agent/src/__tests__/planner.test.ts",
    "packages/agent/src/__tests__/coordinator.test.ts",
    "packages/web/src/components/task/TaskDetailHeader.tsx",
    "packages/web/src/components/task/TaskDetail.tsx",
    "packages/web/src/components/kanban/TaskCard.tsx",
    "packages/web/src/__tests__/TaskDetailHeader.test.tsx",
    "packages/web/src/__tests__/TaskDetail.test.tsx",
    "packages/web/src/__tests__/TaskCard.test.tsx",
    "docs/rdpi/work/work-20260515-system-tz-plan-manifest-quality-gate"
  ],
  "allowedChanges": [
    "source",
    "tests",
    "docs"
  ],
  "forbiddenChanges": [
    "unrelated modules",
    "database schema migration",
    "runtime service probing",
    "child task execution",
    "secrets"
  ],
  "expectedArtifacts": [
    {
      "kind": "source_diff",
      "paths": [
        "packages/shared/src/planQuality.ts",
        "packages/agent/src/subagents/planChecker.ts",
        "packages/agent/src/subagents/planner.ts",
        "packages/agent/src/coordinator.ts",
        "packages/web/src/components/task/TaskDetailHeader.tsx",
        "packages/web/src/components/task/TaskDetail.tsx",
        "packages/web/src/components/kanban/TaskCard.tsx"
      ]
    },
    {
      "kind": "test_diff",
      "paths": [
        "packages/shared/src/__tests__/planQuality.test.ts",
        "packages/agent/src/__tests__/planChecker.test.ts",
        "packages/agent/src/__tests__/planner.test.ts",
        "packages/agent/src/__tests__/coordinator.test.ts",
        "packages/web/src/__tests__/TaskDetailHeader.test.tsx",
        "packages/web/src/__tests__/TaskDetail.test.tsx",
        "packages/web/src/__tests__/TaskCard.test.tsx"
      ]
    },
    {
      "kind": "rdpi_result",
      "paths": [
        "docs/rdpi/work/work-20260515-system-tz-plan-manifest-quality-gate/result.md"
      ]
    }
  ],
  "acceptanceCriteria": [
    {
      "id": "ac-1",
      "description": "New full-mode plans without a valid aif-plan-manifest are rejected deterministically while pre-rollout full-mode plans are not rejected solely for absence of the block.",
      "verification": "npm.cmd test --workspace=@aif/shared -- --run src/__tests__/planQuality.test.ts"
    },
    {
      "id": "ac-2",
      "description": "Plan manifests validate task id, intent, explicit scope, allowed changes, expected artifacts, acceptance criteria, and verification commands.",
      "verification": "npm.cmd test --workspace=@aif/shared -- --run src/__tests__/planQuality.test.ts"
    },
    {
      "id": "ac-3",
      "description": "Plan-checker fallback and normalization paths cannot bypass manifest validation for full-mode tasks.",
      "verification": "npm.cmd test --workspace=@aif/agent -- --run src/__tests__/planChecker.test.ts src/__tests__/planner.test.ts"
    },
    {
      "id": "ac-4",
      "description": "Plan-quality retry feedback is structured in activity logs and third failure blocks with manualReviewRequired=true.",
      "verification": "npm.cmd test --workspace=@aif/agent -- --run src/__tests__/coordinator.test.ts"
    },
    {
      "id": "ac-5",
      "description": "Task card and task detail UI expose plan-quality result and blocker reason for replanning and terminal blockers.",
      "verification": "npm.cmd test --workspace=@aif/web -- --run src/__tests__/TaskDetailHeader.test.tsx src/__tests__/TaskDetail.test.tsx src/__tests__/TaskCard.test.tsx"
    }
  ],
  "verificationCommands": [
    "npm.cmd test --workspace=@aif/shared -- --run src/__tests__/planQuality.test.ts",
    "npm.cmd test --workspace=@aif/agent -- --run src/__tests__/planChecker.test.ts src/__tests__/planner.test.ts src/__tests__/coordinator.test.ts",
    "npm.cmd test --workspace=@aif/web -- --run src/__tests__/TaskDetailHeader.test.tsx src/__tests__/TaskDetail.test.tsx src/__tests__/TaskCard.test.tsx",
    "npm.cmd run build",
    "npm.cmd run lint"
  ]
}
```

## Checklist

- [ ] Extend `packages/shared/src/planQuality.ts` with `aif-plan-manifest` parsing, typed manifest interfaces, new issue codes, and validation helpers.
- [ ] Require a valid manifest for new `plannerMode: "full"` tasks and old full-mode tasks intentionally replanned under the new plan-quality contract; validate present manifests for other modes without making fast-mode or pre-rollout full-mode legacy plans fail when no manifest exists.
- [ ] Reuse `TASK_INTENT_CONTRACTS` to validate manifest `intent`, `allowedChanges`, and forbidden intent-category drift.
- [ ] Update deterministic diagnostic fallback builders so generated fallback plans include a manifest and still pass existing audit scope/report checks.
- [ ] Update planner and plan-checker prompts to request or preserve a full plan with the manifest block, and add planner prompt tests covering full-mode manifest production plus fast-mode compatibility.
- [ ] Update coordinator plan-quality failure handling to persist structured feedback in `agentActivityLog`, make the second feedback stricter, and set `manualReviewRequired=true` on non-roadmap retry-limit blocking.
- [ ] Add focused shared and agent tests for valid manifests, missing manifests, invalid JSON/shape, task-id mismatch, intent mismatch, untestable acceptance criteria, missing verification commands, forbidden allowed changes, pre-rollout full-mode compatibility, fallback behavior, structured replan activity, and retry-limit blocking.
- [ ] Add focused web tests and UI rendering for plan-quality badges and alert text in task detail and task cards.
- [ ] Run the focused verification commands, then `npm.cmd run build` and `npm.cmd run lint`.
- [ ] Record `PLAN PASS`, `TEST PASS`, `REVIEW PASS`, implementation summary, verification results, and memory sync status in `result.md`.
