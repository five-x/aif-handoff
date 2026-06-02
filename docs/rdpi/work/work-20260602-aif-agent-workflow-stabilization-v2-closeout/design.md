# Design

## Scope

Implement the v2 closeout P0 slice:

- Add a backend/service path for `operator_verified_completion`.
- Add trusted operator completion evidence as a structured source, not prose.
- Make `missing_aif_result_contract` non-terminal when stronger trusted completion evidence already exists.
- Support clean committed implementation worktrees in manifest/completion validation without requiring a new dirty change.
- Keep audit/report validator protections intact.

Out of scope for this RDPI cycle:

- Full P1 planner split-required decision contract.
- Same-failure fingerprint fail-closed beyond what is needed for closeout.
- Audit/report prompt cleanup.
- ReviewGate project-specific refutation cleanup.
- Observability counters beyond activity-log entries required by the closeout path.

## Data And Contract Shape

Introduce an operator completion evidence contract that can be stored on a task, likely as a JSON field if schema migration support is straightforward, or as a validated task artifact/attempt if existing artifact storage is a better local pattern.

Required shape:

```json
{
  "version": 1,
  "taskId": "task-id",
  "source": "operator",
  "status": "accepted",
  "commitSha": "40-char sha",
  "changedFiles": ["package.json", "scripts/smoke-api-contract.js"],
  "verification": [
    {
      "command": "npm run test:smoke",
      "status": "passed",
      "outputPreview": "27 PASS\n0 FAIL",
      "outputSha256": "64-char sha"
    }
  ],
  "worktreeClean": true,
  "operatorNote": "short note",
  "acceptedAt": "ISO datetime"
}
```

Validation should reject missing commit sha, missing changed files, non-passed verification, empty output preview, dirty relevant worktree state, missing committed files, and audit/report invalidity.

Commit validation must prove task relevance, not only file existence. A declared changed file is valid only when it appears in at least one trusted committed-change source for the submitted commit:

- `git diff-tree --no-commit-id --name-only -r <commitSha>` for the submitted commit.
- The task branch diff from the configured base branch to `commitSha`.
- A validated task worktree/branch metadata source if present locally.

A file that exists in the commit tree but was not changed by the submitted commit or task branch diff must be rejected.

## API And Service

Add `POST /tasks/:id/operator-verified-completion` with a schema-local validator.

The route should delegate to a service function so tests can exercise policy without only route-level assertions. The service should:

- Load the task and project.
- Check task status is one of the allowed closeout states: `blocked_external`, `implementing`, `review`, or `done` rework/request-change states.
- Resolve project root or task worktree root.
- Verify commit exists.
- Verify every declared changed file appears in the submitted commit diff or validated task branch diff, not merely in the commit tree.
- Verify the relevant worktree is clean, or dirty files do not intersect declared task scope.
- Verify at least one passed verification item has command, output preview, and output hash.
- Verify there are no pending checklist items unless each pending item is explicitly marked superseded/cancelled by validated evidence.
- Verify there are no unresolved blocking findings unless the request includes an explicit operator override and the task type allows that override.
- Verify any existing "human approval required before verified" metadata is satisfied before moving to a terminal verified/approved state.
- For audit/report tasks, call existing completion/audit evidence validators and reject invalid report artifacts.
- Persist structured operator completion evidence.
- Build or repair implementation manifest evidence for development tasks from the operator evidence where needed.
- Transition through a code-enforced `operator_verified_completion` lifecycle path, not ad-hoc direct status mutation.
- Transition according to lifecycle policy without starting implementer again:
  - `review` when review is required.
  - `done` when review is skipped and QA is not required.
  - `qa` only if the repository already has a QA lifecycle branch for that task type.
- Assert the transition does not enqueue `start_ai`, create a runtime session, or wake the implementer for the accepted task.

## Completion Evidence Integration

Update completion evidence handling so operator completion evidence can be a trusted source when it is already accepted.

The hierarchy should be:

1. Valid implementation manifest from current run.
2. Valid `aif-result` from current run plus observed verification.
3. Accepted operator verified completion evidence.
4. Deterministic recovery manifest only when validation is ok.

Do not let `missing_aif_result_contract` block a task that already has accepted operator completion evidence. Continue to block ordinary agent-only rework with missing `aif-result`.

## Clean Committed Worktree Handling

Keep the existing protection that manifest `changedFiles` must match actual task evidence, but expand the source of actual evidence:

- Dirty files.
- Committed files from task branch diff.
- HEAD commit files where base branch diff is unavailable or the task branch is effectively the current branch.
- Operator evidence changed files after commit validation.

The validator should not require files to remain dirty after a successful commit. It must still avoid inheriting unrelated base-branch commits.

## Activity Log

Record explicit audit-friendly activity:

- Accepted: `operator_verified_completion accepted: commit=<sha>; verification=<command>; outputSha=<sha>; nextStatus=<status>`.
- Rejected: `operator_verified_completion rejected: reason=<reason>`.

## Test Strategy

Primary tests:

- Route/service accepts a blocked implementation task with a clean committed worktree and passed verification, then transitions to the expected next lifecycle state.
- Route/service rejects missing commit sha, nonexistent commit, commit missing changed files, failed verification, empty verification preview, and dirty relevant scope.
- Route/service rejects a declared changed file that exists in the commit tree but is absent from the submitted commit diff and validated task branch diff.
- Route/service rejects pending checklist items unless validated superseded/cancelled evidence exists.
- Route/service rejects unresolved blockers without an explicit allowed operator override.
- Route/service respects any human-approval-required metadata before terminal verified/approved state.
- Operator evidence does not bypass invalid audit/report artifacts.
- `missing_aif_result_contract` still blocks agent-only rework without operator evidence.
- Clean committed `package.json` plus script file plus plan file validates without requiring dirty changes.
- Accepted operator completion does not start or enqueue the implementer again.

Targeted regression:

- Recreate the server E2E closeout shape locally: already committed `.ai-factory/PLAN.md`, `package.json`, `scripts/smoke-api-contract.js`, clean worktree, smoke verification evidence, blocked task from implementing. The operator closeout endpoint should move it to terminal/next lifecycle state without another implementer run.

Post-implementation live E2E:

- Replay the server scenario required by the v2 DoD after local gates pass:
  - create/list disposable project;
  - create/list paused backlog task;
  - create/read task comment;
  - ensure no agent task execution is started by the smoke flow;
  - run the smoke command successfully;
  - call `POST /tasks/:id/operator-verified-completion`;
  - verify the card reaches the expected terminal or next lifecycle state without implementer retry.
