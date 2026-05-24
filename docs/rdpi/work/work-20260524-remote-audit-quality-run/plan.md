# Plan

1. Get independent `PLAN PASS` for this remote-only diagnostic plan.
2. Verify the remote service health through `http://192.168.88.67/api/health`.
3. Query remote projects and confirm the `botIntevra` project id `e4a3a101-ec7f-4f93-9b68-e297ffe8952f` is still present.
4. Create a narrow audit task with:
   - the exact payload in `design.md`;
   - task intent `audit`;
   - one report artifact path: `audit/remote-audit-quality-20260524-botintevra-data-safety.md`;
   - no fixes or product/config/runtime edits authorized;
   - concrete risk hypotheses already embedded in the payload;
   - remote-quality marker in title/tags.
5. Poll only remote API endpoints until terminal state or timeout.
6. Fetch task detail, timeline, artifact trust, and evidence endpoints.
7. Fetch report artifact content if exposed by remote task data or attachments; otherwise record that the artifact was not API-accessible.
8. Evaluate audit output quality against the design rubric and minimum evidence criteria.
   - `done`: score the report content and artifact trust.
   - `blocked` or `blocked_external`: score the blocker quality and whether it is fail-closed with actionable evidence.
   - timeout or missing required evidence: mark the audit-quality run inconclusive.
9. Record the result in `result.md`.

## Plan Review Request

Independent reviewer should check that this plan is remote-only, diagnostic-only, narrow enough to avoid broad-audit decomposition, and capable of assessing audit quality without local service validation.
