import type {
  WorkflowTimeline,
  WorkflowTimelineAttempt,
  WorkflowTimelineArtifact,
  WorkflowTimelineClaim,
  WorkflowTimelineEvidence,
  WorkflowTimelineEvent,
} from "@aif/shared/browser";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";

interface WorkflowTimelinePanelProps {
  timeline?: WorkflowTimeline | null;
  isLoading?: boolean;
}

const OUTCOME_LABELS: Record<string, string> = {
  supported: "Supported",
  refuted: "Refuted",
  inconclusive: "Inconclusive",
  blocked: "Blocked",
  waived: "Waived",
  not_evaluated: "Not evaluated",
};

const STATE_LABELS: Record<string, string> = {
  expected: "Expected",
  accepted: "Accepted",
  rejected: "Rejected",
  missing: "Missing",
  inconclusive: "Inconclusive",
  blocked: "Blocked",
  manual_exception: "Manual exception",
};

function formatDate(value: string | null | undefined): string {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function metadataString(metadata: Record<string, unknown>, key: string): string | null {
  const value = metadata[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function metadataStringList(metadata: Record<string, unknown>, key: string): string[] {
  const value = metadata[key];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.length > 0)
    : [];
}

function ArtifactRow({
  artifact,
  claims,
}: {
  artifact: WorkflowTimelineArtifact;
  claims: WorkflowTimelineClaim[];
}) {
  const currentClaim = claims.find(
    (claim) => claim.artifactId === artifact.id && claim.attemptId === null,
  );
  const role = metadataString(artifact.metadata, "role");
  const originalState = metadataString(artifact.metadata, "originalState");
  const failureFamily = metadataString(artifact.metadata, "failureFamily");
  const failureSignature = metadataString(artifact.metadata, "failureSignature");
  const branchName = metadataString(artifact.metadata, "branchName");
  const worktreePath = metadataString(artifact.metadata, "worktreePath");
  const reasonCodes = metadataStringList(artifact.metadata, "reasonCodes");

  return (
    <div className="border border-border bg-background p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{artifact.label}</span>
        <Badge variant="outline" size="sm">
          {STATE_LABELS[artifact.state] ?? artifact.state}
        </Badge>
        {currentClaim && (
          <Badge variant="outline" size="sm">
            {OUTCOME_LABELS[currentClaim.outcome] ?? currentClaim.outcome}
          </Badge>
        )}
        {currentClaim && (
          <Badge variant="outline" size="sm">
            Trust: {currentClaim.trustLevel}
          </Badge>
        )}
      </div>
      {artifact.path && (
        <div className="mt-2 break-all font-mono text-xs text-muted-foreground">
          {artifact.path}
        </div>
      )}
      <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
        <span>Attempts: {artifact.currentAttemptNumber}</span>
        <span>Updated: {formatDate(artifact.updatedAt)}</span>
        {role && <span>Role: {role}</span>}
        {originalState && <span>Original: {originalState}</span>}
        {failureFamily && <span>Failure: {failureFamily}</span>}
        {branchName && <span>Branch: {branchName}</span>}
        {worktreePath && <span className="break-all">Worktree: {worktreePath}</span>}
      </div>
      {failureSignature && (
        <div className="mt-1 break-all font-mono text-3xs text-muted-foreground">
          Failure signature: {failureSignature}
        </div>
      )}
      {reasonCodes.length > 0 && (
        <div className="mt-1 text-xs text-muted-foreground">
          Reason codes: {reasonCodes.join(", ")}
        </div>
      )}
    </div>
  );
}

function EvidenceRow({
  evidence,
  links,
}: {
  evidence: WorkflowTimelineEvidence;
  links: WorkflowTimeline["evidenceLinks"];
}) {
  const sourceSnapshotId = metadataString(evidence.metadata, "sourceSnapshotId");
  const linked = links.filter((link) => link.evidenceId === evidence.id);
  return (
    <div className="border border-border/70 bg-muted/30 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">Evidence</span>
        <Badge variant="outline" size="sm">
          {evidence.kind}
        </Badge>
        <Badge variant="outline" size="sm">
          {evidence.grade}
        </Badge>
      </div>
      <div className="mt-1 text-xs text-muted-foreground">
        {evidence.toolName} | {formatDate(evidence.createdAt)}
      </div>
      {(sourceSnapshotId || linked.length > 0) && (
        <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
          {sourceSnapshotId && <span>Snapshot: {sourceSnapshotId}</span>}
          {linked.map((link) => (
            <span key={link.id}>
              Link: {link.relation} {link.artifactId ?? link.claimId ?? "task"}
            </span>
          ))}
        </div>
      )}
      {evidence.summary && (
        <div className="mt-2 whitespace-pre-wrap break-words text-xs text-foreground">
          {evidence.summary}
        </div>
      )}
    </div>
  );
}

function ClaimRow({ claim }: { claim: WorkflowTimelineClaim }) {
  const role = metadataString(claim.metadata, "role");
  const originalState = metadataString(claim.metadata, "originalState");
  const failureFamily = metadataString(claim.metadata, "failureFamily");
  const failureSignature = metadataString(claim.metadata, "failureSignature");
  const reasonCodes = metadataStringList(claim.metadata, "reasonCodes");

  return (
    <div className="border border-border/70 bg-muted/20 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{claim.label}</span>
        <Badge variant="outline" size="sm">
          {OUTCOME_LABELS[claim.outcome] ?? claim.outcome}
        </Badge>
      </div>
      <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
        <span>Trust: {claim.trustLevel}</span>
        <span>Evaluated: {formatDate(claim.evaluatedAt)}</span>
        {role && <span>Role: {role}</span>}
        {originalState && <span>Original: {originalState}</span>}
        {failureFamily && <span>Failure: {failureFamily}</span>}
      </div>
      {failureSignature && (
        <div className="mt-1 break-all font-mono text-3xs text-muted-foreground">
          Failure signature: {failureSignature}
        </div>
      )}
      {reasonCodes.length > 0 && (
        <div className="mt-1 text-xs text-muted-foreground">
          Reason codes: {reasonCodes.join(", ")}
        </div>
      )}
    </div>
  );
}

function AttemptRow({ attempt }: { attempt: WorkflowTimelineAttempt }) {
  const classification = metadataString(attempt.metadata, "classification");
  const failureFamily = metadataString(attempt.metadata, "failureFamily");
  const originalState = metadataString(attempt.metadata, "originalState");
  const reworkStatus = metadataString(attempt.metadata, "reworkStatus");
  const sourceSnapshotId = attempt.sourceSnapshotId;
  const failureSignature = metadataString(attempt.metadata, "failureSignature");
  const reasonCodes = metadataStringList(attempt.metadata, "reasonCodes");

  return (
    <div className="border border-border/70 bg-muted/20 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">Attempt {attempt.attemptNumber}</span>
        <Badge variant="outline" size="sm">
          {STATE_LABELS[attempt.state] ?? attempt.state}
        </Badge>
        <Badge variant="outline" size="sm">
          {OUTCOME_LABELS[attempt.outcome] ?? attempt.outcome}
        </Badge>
      </div>
      <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
        <span>Trust: {attempt.trustLevel}</span>
        <span>Recorded: {formatDate(attempt.createdAt)}</span>
        {originalState && <span>Original: {originalState}</span>}
        {classification && <span>Classification: {classification}</span>}
        {failureFamily && <span>Failure: {failureFamily}</span>}
        {reworkStatus && <span>Rework: {reworkStatus}</span>}
        {sourceSnapshotId && <span>Snapshot: {sourceSnapshotId}</span>}
      </div>
      {failureSignature && (
        <div className="mt-1 break-all font-mono text-3xs text-muted-foreground">
          Failure signature: {failureSignature}
        </div>
      )}
      {reasonCodes.length > 0 && (
        <div className="mt-1 text-xs text-muted-foreground">
          Reason codes: {reasonCodes.join(", ")}
        </div>
      )}
    </div>
  );
}

function EventRow({ event }: { event: WorkflowTimelineEvent }) {
  return (
    <li className="border-l border-border pb-3 pl-3 last:pb-0">
      <div className="text-xs font-medium">{event.title}</div>
      <div className="text-3xs uppercase text-muted-foreground">{event.kind}</div>
      <div className="mt-1 text-xs text-muted-foreground">{formatDate(event.occurredAt)}</div>
    </li>
  );
}

export function WorkflowTimelinePanel({ timeline, isLoading = false }: WorkflowTimelinePanelProps) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner size="sm" />
        <span>Loading timeline...</span>
      </div>
    );
  }

  if (!timeline) {
    return <div className="text-sm text-muted-foreground">Timeline unavailable.</div>;
  }

  const hasTimelineData =
    timeline.artifacts.length > 0 || timeline.claims.length > 0 || timeline.evidence.length > 0;

  if (!hasTimelineData) {
    return (
      <div className="space-y-2 text-sm text-muted-foreground">
        <p>No workflow artifacts or evidence have been recorded for this task yet.</p>
        <p>Workflow: {timeline.context.workflowKind}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
        <span>Workflow: {timeline.context.workflowKind}</span>
        {timeline.context.roadmapAlias && <span>Roadmap: {timeline.context.roadmapAlias}</span>}
        {timeline.context.sourceId && <span>Source: {timeline.context.sourceId}</span>}
      </div>

      {timeline.artifacts.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase text-muted-foreground">Artifacts</h3>
          {timeline.artifacts.map((artifact) => (
            <ArtifactRow key={artifact.id} artifact={artifact} claims={timeline.claims} />
          ))}
        </div>
      )}

      {timeline.evidence.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase text-muted-foreground">Evidence</h3>
          {timeline.evidence.map((item) => (
            <EvidenceRow key={item.id} evidence={item} links={timeline.evidenceLinks} />
          ))}
        </div>
      )}

      {timeline.claims.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase text-muted-foreground">Claims</h3>
          {timeline.claims.map((claim) => (
            <ClaimRow key={claim.id} claim={claim} />
          ))}
        </div>
      )}

      {timeline.attempts.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase text-muted-foreground">Attempts</h3>
          {timeline.attempts.map((attempt) => (
            <AttemptRow key={attempt.id} attempt={attempt} />
          ))}
        </div>
      )}

      {timeline.events.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase text-muted-foreground">Events</h3>
          <ol className="space-y-0">
            {timeline.events.map((event) => (
              <EventRow key={event.id} event={event} />
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
