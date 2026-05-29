export const REQUIREMENTS_LIFECYCLE_METRIC_KEY = "requirements_lifecycle_events_total";

export const REQUIREMENTS_LIFECYCLE_EVENTS = {
  SNAPSHOT_CREATED: "requirements.lifecycle.snapshot.created",
  STAGE_ARTIFACT_ATTEMPT_PERSISTED: "requirements.lifecycle.stage_artifact_attempt.persisted",
  QUESTION_BATCH_CREATED: "requirements.lifecycle.question_batch.created",
  QUESTION_BATCH_DEDUPED: "requirements.lifecycle.question_batch.deduped",
  QUESTION_BATCH_ANSWERED: "requirements.lifecycle.question_batch.answered",
  QUESTION_BATCH_RESUME_DECIDED: "requirements.lifecycle.question_batch.resume_decided",
  SPLIT_PROPOSAL_CREATED: "requirements.lifecycle.split_proposal.created",
  SPLIT_PROPOSAL_REUSED: "requirements.lifecycle.split_proposal.reused",
  SPLIT_PROPOSAL_CONFLICT: "requirements.lifecycle.split_proposal.conflict",
  SPLIT_PROPOSAL_APPROVED: "requirements.lifecycle.split_proposal.approved",
  SPLIT_PROPOSAL_REJECTED: "requirements.lifecycle.split_proposal.rejected",
  SPLIT_PROPOSAL_ALREADY_APPROVED: "requirements.lifecycle.split_proposal.already_approved",
  SPLIT_PROPOSAL_ALREADY_REJECTED: "requirements.lifecycle.split_proposal.already_rejected",
  ACCEPTANCE_PACK_CREATED: "requirements.lifecycle.acceptance_pack.created",
  QA_GATE_ROUTED: "requirements.lifecycle.qa_gate.routed",
  QA_GATE_BLOCKED: "requirements.lifecycle.qa_gate.blocked",
  QA_GATE_ACCEPTED: "requirements.lifecycle.qa_gate.accepted",
} as const;

export type RequirementsLifecycleEventName =
  (typeof REQUIREMENTS_LIFECYCLE_EVENTS)[keyof typeof REQUIREMENTS_LIFECYCLE_EVENTS];

export type RequirementsLifecycleDimensionValue = string | number | boolean | null | undefined;

export type RequirementsLifecycleDimensions = Readonly<
  Record<string, RequirementsLifecycleDimensionValue>
>;

export interface RequirementsLifecycleMetric {
  event: RequirementsLifecycleEventName;
  metricKey: typeof REQUIREMENTS_LIFECYCLE_METRIC_KEY;
  metricValue: 1;
  dimensions: Record<string, string | number | boolean | null>;
}

export function buildRequirementsLifecycleMetric(
  event: RequirementsLifecycleEventName,
  dimensions: RequirementsLifecycleDimensions = {},
): RequirementsLifecycleMetric {
  return {
    event,
    metricKey: REQUIREMENTS_LIFECYCLE_METRIC_KEY,
    metricValue: 1,
    dimensions: Object.fromEntries(
      Object.entries(dimensions)
        .filter(
          (entry): entry is [string, string | number | boolean | null] => entry[1] !== undefined,
        )
        .sort(([left], [right]) => left.localeCompare(right)),
    ),
  };
}
