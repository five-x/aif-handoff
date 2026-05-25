# Design - Remote Audit Quality Trust Canary

## Goal

Run a diagnostic remote-only canary against `http://192.168.88.67/api` that proves the deployed audit pipeline does not promote weak or fabricated evidence to trusted `validated_no_findings`, and that a valid ledger-backed committed audit artifact can become trusted when the deployed P0 implementation supports that path.

## Scope

- In scope:
  - Remote API interaction with `192.168.88.67` only.
  - Remote task creation or remote roadmap import/generation if needed for trusted artifact coverage.
  - Remote polling of task status, timeline, evidence, and artifact-trust endpoints.
  - Capturing result evidence in `result.md`.
  - Queueing follow-up intake cards for newly discovered defects, without executing them.
- Out of scope:
  - Implementing fixes.
  - Starting local AIF services or local e2e/browser validation.
  - Editing deployed source, remote files, or local source as a fix.
  - Treating remote task success as trusted proof unless manifest, ledger, source snapshot, committed blob, lifecycle, and synthesis trust all validate.

## Remote Target Guard

All live commands after `PLAN PASS` must derive their base URL from exactly:

```text
http://192.168.88.67/api
```

The canary runner must reject:

- loopback service targets
- `127.0.0.0/8`
- `[::1]`
- `0.0.0.0`
- `[::]`
- any URL whose host is not `192.168.88.67`

No command should set `AIF_SKIP_DEV_SERVER=0`, run `npm run dev`, open a local browser target, or call a local API port.

## Canary Shape

### Negative Scenario

Create a narrow remote audit task whose prompt/report requirements intentionally stress weak-evidence failure modes:

- concrete report artifact path under `audit/`;
- explicit diagnostic-only constraint;
- no source/config/test edits;
- manifest and ledger requirements;
- at least one impossible or weak evidence condition, such as fabricated evidence ref, missing file reference, invalid line reference, or unsupported no-findings claim.

The negative scenario passes only if remote evidence shows it cannot become trusted `validated_no_findings`. Acceptable negative outcomes are:

- task is reworked, blocked, invalid, source-inconclusive, or manual/operator blocked;
- `artifactTrust.trustedSynthesisInput` is false;
- `artifactTrust.artifactTrustLevel` is not `trusted`;
- reason codes or validation details name concrete validator/lifecycle/review issues;
- fingerprint/failure signature or validation fingerprint is present when available;
- next action is actionable, such as `retry_source_rework`, `inspect_untrusted_source`, `provide_operator_input`, `retry_synthesis`, or a typed equivalent.

A negative task reaching `done` or `verified` with trusted `validated_no_findings` is a canary failure.

### Positive Scenario

Attempt a narrow positive trusted audit artifact path after the negative scenario:

- Use a remote task that can collect real runtime ledger evidence from scoped source.
- Require a finalized `audit-report-manifest`.
- Require report artifact commit and committed blob revalidation.
- Prefer a roadmap-backed audit artifact if direct task creation does not expose artifact role/batch trust.
- Poll task detail, timeline, evidence, and artifact-trust endpoints.

The positive scenario passes only if the remote artifact is trusted by machine-readable state:

- task terminal state is `done` or `verified`;
- `artifactTrust.artifactTrustLevel` is `trusted`;
- `artifactTrust.trustedSynthesisInput` is true;
- `artifactTrust.nextAction` is `none`;
- artifact/timeline validation details include trusted source classification (`validated_no_findings` or `validated_findings_present`);
- manifest status is valid;
- ledger evidence exists and is bound to the audit plan/source snapshot;
- lifecycle state includes committed and committed-blob-revalidated evidence.

If the P0 implementation cannot produce the positive path, record the exact remote blocker rather than forcing success.

## Evidence Collection

For each remote canary task, collect:

- base URL and target host proof;
- request payload summary, with no secrets;
- task id, project id, title, status, blocked reason, manual-review flags, branch/worktree fields if surfaced;
- `GET /tasks/:id`;
- `GET /tasks/:id/artifact-trust`;
- `GET /tasks/:id/timeline`;
- `GET /tasks/:id/evidence`;
- `GET /tasks/:id/comments` if needed to capture review-gate reason codes;
- relevant issue codes, repair mode, validation fingerprint, failure signature, lifecycle state, and next action.

The result should summarize raw evidence rather than embedding full responses when large.

## Result Classification

Close the diagnostic task with exactly one primary classification:

- `audit quality fixed`: negative cannot become trusted pass, positive produces trusted ledger-backed committed artifact, and issue output is actionable.
- `blocked by trust boundary`: negative fails correctly or partially, but positive cannot produce trusted pass because manifest/ledger/snapshot/commit/lifecycle/synthesis trust is missing or not exposed.
- `blocked by runtime saturation`: remote API/agent/runtime cannot execute or complete canary tasks because of timeouts, lease/cooldown/backpressure, provider limits, or unreachable services.
- `canary failed`: weak/fabricated evidence is promoted to trusted `validated_no_findings`, or failure output lacks the required issue codes/fingerprint/lifecycle/next action.

## Follow-Up Handling

If a new defect appears, create a queued intake card only. Do not implement or execute a child fix in this task.
