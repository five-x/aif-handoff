import { useState, type ReactNode } from "react";
import { Trash2 } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  useCleanupTaskWorktree,
  useProjectKnowledge,
  useProjectQueue,
  useProjectRuntimeUsage,
  useTask,
  useTaskEvidence,
  useTaskMemoryCandidates,
  useTaskRuntimeUsage,
  useTaskTimeline,
  useTaskWorktree,
} from "@/hooks/useTasks";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { TaskDescription } from "./TaskDescription";
import { TaskPlan } from "./TaskPlan";
import { TaskLog } from "./TaskLog";
import { AgentTimeline } from "./AgentTimeline";
import { WorkflowTimelinePanel } from "./WorkflowTimelinePanel";
import { TaskComments } from "./TaskComments";
import { TaskAttachments } from "./TaskAttachments";
import { TaskSettings } from "./TaskSettings";
import { PlanChangeDialog } from "./PlanChangeDialog";
import { TaskDetailHeader, type TaskDetailTab } from "./TaskDetailHeader";
import { Section } from "./Section";
import { useTaskDetailActions } from "./useTaskDetailActions";
import { AlertBox } from "@/components/ui/alert-box";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
import { getPlanQualityPresentation } from "@/lib/planQuality";
import { getAuditCardDecisionRows } from "@/lib/artifactTrust";
import { formatTokenCount, formatUsd } from "@/lib/formatters";
import {
  redactProviderText,
  type AutoReviewState,
  type ProjectKnowledgeResponse,
  type ProjectQueueStateResponse,
  type ProjectRuntimeUsageResponse,
  type Task,
  type TaskMemoryCandidatesResponse,
  type TaskOperatorEvidenceResponse,
  type TaskRuntimeUsageResponse,
  type TaskWorktreeInspection,
  type WorkflowTimeline,
} from "@aif/shared/browser";

interface TaskDetailProps {
  taskId: string | null;
  onClose: () => void;
}

function safeReviewText(value: unknown): string {
  return redactProviderText(String(value ?? "").trim());
}

function ReviewBlockerHistory({ state }: { state: AutoReviewState }) {
  const history = Array.isArray((state as { blockerHistory?: unknown }).blockerHistory)
    ? ((state as { blockerHistory?: Array<Record<string, unknown>> }).blockerHistory ?? [])
    : [];
  const securityCoverage = Array.isArray(state.securityCoverage) ? state.securityCoverage : [];
  const snapshot = state.reworkSnapshot as
    | (AutoReviewState["reworkSnapshot"] & {
        changedFilesDigest?: string | null;
        baselineHeadSha?: string | null;
        requiredEvidenceByFindingId?: Record<string, string>;
      })
    | undefined;

  return (
    <Section title="Blocker History">
      <div className="space-y-3 text-xs">
        <div className="flex flex-wrap gap-2 text-muted-foreground">
          <span>Strategy: {safeReviewText(state.strategy)}</span>
          <span>Iteration: {state.iteration}</span>
        </div>

        {state.findings.length > 0 && (
          <div className="space-y-2">
            {state.findings.map((finding) => (
              <div key={finding.id} className="border border-border px-3 py-2">
                <div className="flex flex-wrap items-center gap-2 font-mono text-3xs text-muted-foreground">
                  <span>{safeReviewText(finding.id)}</span>
                  <span>{safeReviewText(finding.source)}</span>
                  {finding.status && <span>{safeReviewText(finding.status)}</span>}
                  {finding.streak != null && <span>streak {finding.streak}</span>}
                  {finding.lastSeenIteration != null && (
                    <span>last seen {finding.lastSeenIteration}</span>
                  )}
                </div>
                <div className="mt-1 text-foreground">{safeReviewText(finding.text)}</div>
              </div>
            ))}
          </div>
        )}

        {history.length > 0 && (
          <div className="space-y-1 border-t border-border pt-2">
            {history.map((entry, index) => (
              <div key={`${safeReviewText(entry.id)}-${index}`} className="text-muted-foreground">
                <span className="font-mono text-3xs">{safeReviewText(entry.id)}</span>{" "}
                {safeReviewText(entry.status)}: {safeReviewText(entry.note ?? entry.text)}
              </div>
            ))}
          </div>
        )}

        {securityCoverage.length > 0 && (
          <div className="space-y-1 border-t border-border pt-2 text-muted-foreground">
            {securityCoverage.map((entry) => (
              <div key={entry.area}>
                {safeReviewText(entry.area)}: {safeReviewText(entry.status)} -{" "}
                {safeReviewText(entry.note)}
              </div>
            ))}
          </div>
        )}

        {snapshot && (
          <div className="space-y-1 border-t border-border pt-2 font-mono text-3xs text-muted-foreground">
            {(snapshot.findingIds?.length ?? 0) > 0 && (
              <div>blockers: {snapshot.findingIds?.map(safeReviewText).join(", ")}</div>
            )}
            {snapshot.artifactPath && <div>path: {safeReviewText(snapshot.artifactPath)}</div>}
            {snapshot.artifactContentSha && (
              <div>artifact sha: {safeReviewText(snapshot.artifactContentSha).slice(0, 16)}</div>
            )}
            {snapshot.changedFilesDigest && (
              <div>worktree digest: {safeReviewText(snapshot.changedFilesDigest).slice(0, 16)}</div>
            )}
            {snapshot.baselineHeadSha && (
              <div>baseline: {safeReviewText(snapshot.baselineHeadSha).slice(0, 16)}</div>
            )}
          </div>
        )}
      </div>
    </Section>
  );
}

function DetailRows({ rows }: { rows: Array<[string, ReactNode]> }) {
  return (
    <div className="grid gap-2 text-xs">
      {rows.map(([label, value]) => (
        <div key={label} className="grid grid-cols-[8rem_1fr] gap-3 border-b border-border/50 pb-2">
          <div className="text-muted-foreground">{label}</div>
          <div className="min-w-0 break-words text-foreground">{value ?? "None"}</div>
        </div>
      ))}
    </div>
  );
}

function EvidenceView({
  timeline,
  evidenceResponse,
  isLoading,
}: {
  timeline?: WorkflowTimeline | null;
  evidenceResponse?: TaskOperatorEvidenceResponse | null;
  isLoading?: boolean;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner size="sm" />
        <span>Loading evidence...</span>
      </div>
    );
  }
  const evidence = evidenceResponse?.evidence ?? timeline?.evidence ?? [];
  const links = evidenceResponse?.evidenceLinks ?? timeline?.evidenceLinks ?? [];
  if (evidence.length === 0) {
    return <div className="text-sm text-muted-foreground">No evidence recorded for this task.</div>;
  }
  return (
    <div className="space-y-2">
      {evidence.map((item) => (
        <div key={item.id} className="border border-border bg-background/60 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{item.id}</span>
            <Badge variant="outline" size="sm">
              {item.kind}
            </Badge>
            <Badge variant="outline" size="sm">
              {item.grade}
            </Badge>
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {item.toolName} | {new Date(item.createdAt).toLocaleString()}
          </div>
          {item.summary && (
            <div className="mt-2 whitespace-pre-wrap break-words text-xs">{item.summary}</div>
          )}
          {links.some((link) => link.evidenceId === item.id) && (
            <div className="mt-2 flex flex-wrap gap-2 text-3xs text-muted-foreground">
              {links
                .filter((link) => link.evidenceId === item.id)
                .map((link) => (
                  <span key={link.id}>
                    {link.relation}: {link.artifactId ?? link.claimId ?? "task"}
                  </span>
                ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function ArtifactsView({ timeline }: { timeline?: WorkflowTimeline | null }) {
  const artifacts = timeline?.artifacts ?? [];
  const claims = timeline?.claims ?? [];
  const attempts = timeline?.attempts ?? [];
  if (artifacts.length === 0 && claims.length === 0 && attempts.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        No artifacts, claims, or attempts have been projected for this task.
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {artifacts.map((artifact) => (
        <div key={artifact.id} className="border border-border bg-background/60 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{artifact.label}</span>
            <Badge variant="outline" size="sm">
              {artifact.state}
            </Badge>
            <Badge variant="outline" size="sm">
              attempts {artifact.currentAttemptNumber}
            </Badge>
          </div>
          {artifact.path && (
            <div className="mt-2 break-all font-mono text-xs text-muted-foreground">
              {artifact.path}
            </div>
          )}
        </div>
      ))}
      {claims.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold uppercase text-muted-foreground">Claims</h4>
          {claims.map((claim) => (
            <div key={claim.id} className="border border-border/70 bg-muted/20 p-3 text-xs">
              <div className="font-medium">{claim.label}</div>
              <div className="mt-1 text-muted-foreground">
                {claim.outcome} | trust {claim.trustLevel}
              </div>
            </div>
          ))}
        </div>
      )}
      {attempts.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold uppercase text-muted-foreground">Attempts</h4>
          {attempts.map((attempt) => (
            <div key={attempt.id} className="border border-border/70 bg-muted/20 p-3 text-xs">
              Attempt {attempt.attemptNumber}: {attempt.state} / {attempt.outcome}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MemoryView({
  taskMemory,
  projectKnowledge,
  isLoading,
}: {
  taskMemory?: TaskMemoryCandidatesResponse | null;
  projectKnowledge?: ProjectKnowledgeResponse | null;
  isLoading?: boolean;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner size="sm" />
        <span>Loading memory...</span>
      </div>
    );
  }
  const taskItems = taskMemory?.candidates ?? [];
  const projectItems = projectKnowledge?.items ?? [];
  return (
    <div className="space-y-3">
      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
          Task Memory Candidates
        </h4>
        {taskItems.length === 0 ? (
          <div className="text-sm text-muted-foreground">No task memory candidates.</div>
        ) : (
          <div className="space-y-2">
            {taskItems.map((item) => (
              <div key={item.id} className="border border-border bg-background/60 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{item.title}</span>
                  <Badge variant="outline" size="sm">
                    {item.status}
                  </Badge>
                  {item.itemType && (
                    <Badge variant="outline" size="sm">
                      {item.itemType}
                    </Badge>
                  )}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{item.summary}</div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
          Project Knowledge
        </h4>
        {projectItems.length === 0 ? (
          <div className="text-sm text-muted-foreground">No project knowledge items.</div>
        ) : (
          <div className="space-y-2">
            {projectItems.slice(0, 8).map((item) => (
              <div key={item.id} className="border border-border/70 bg-muted/20 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{item.title}</span>
                  <Badge variant="outline" size="sm">
                    {item.status}
                  </Badge>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{item.summary}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function RuntimeView({
  task,
  usage,
  projectUsage,
}: {
  task: Task;
  usage?: TaskRuntimeUsageResponse | null;
  projectUsage?: ProjectRuntimeUsageResponse | null;
}) {
  const effective = task.effectiveRuntime;
  const taskSummary = usage?.totals ?? {
    inputTokens: task.tokenInput ?? 0,
    outputTokens: task.tokenOutput ?? 0,
    totalTokens: task.tokenTotal ?? 0,
    costUsd: task.costUsd ?? 0,
  };
  return (
    <div className="space-y-3">
      <DetailRows
        rows={[
          ["Runtime", effective?.runtimeId ?? "Not resolved"],
          ["Provider", effective?.providerId ?? "Not resolved"],
          ["Profile", effective?.profileName ?? effective?.profileId ?? "Default"],
          ["Source", effective?.source ?? "Default"],
          ["Task tokens", formatTokenCount(taskSummary.totalTokens)],
          ["Task cost", formatUsd(taskSummary.costUsd)],
          ["Project tokens", formatTokenCount(projectUsage?.totals.totalTokens)],
          ["Project cost", formatUsd(projectUsage?.totals.costUsd)],
        ]}
      />
      {(usage?.events.length ?? 0) > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold uppercase text-muted-foreground">Recent Usage</h4>
          {usage!.events.slice(0, 8).map((event) => (
            <div key={event.id} className="border border-border/70 bg-muted/20 p-3 text-xs">
              <div className="font-medium">
                {event.runtimeId}/{event.providerId} {event.workflowKind ?? ""}
              </div>
              <div className="mt-1 text-muted-foreground">
                {event.outcome} | {formatTokenCount(event.totalTokens)} |{" "}
                {formatUsd(event.costUsd ?? undefined)} |{" "}
                {new Date(event.createdAt).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function GitView({
  task,
  worktree,
  cleanupPending,
  onArchive,
  onDelete,
}: {
  task: Task;
  worktree?: TaskWorktreeInspection | null;
  cleanupPending?: boolean;
  onArchive: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="space-y-3">
      <DetailRows
        rows={[
          ["Branch", task.branchName ?? worktree?.branchName ?? "None"],
          ["Worktree", task.worktreePath ?? worktree?.path ?? "None"],
          ["Exists", worktree ? (worktree.exists ? "Yes" : "No") : "Unknown"],
          ["Cleanup safe", worktree ? (worktree.eligible ? "Yes" : "No") : "Unknown"],
          ["Size", worktree?.sizeBytes == null ? "Unknown" : `${worktree.sizeBytes} bytes`],
        ]}
      />
      {(worktree?.warnings.length ?? 0) > 0 && (
        <div className="flex flex-wrap gap-2">
          {worktree!.warnings.map((warning) => (
            <Badge
              key={warning}
              size="sm"
              className="border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-300"
            >
              {warning}
            </Badge>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onArchive}
          disabled={cleanupPending || !worktree?.eligible}
        >
          Archive worktree
        </Button>
        <Button
          type="button"
          size="sm"
          variant="destructive"
          onClick={onDelete}
          disabled={cleanupPending || !worktree?.eligible}
        >
          Delete worktree
        </Button>
      </div>
    </div>
  );
}

function OverviewView({
  task,
  timeline,
  projectQueue,
}: {
  task: Task;
  timeline?: WorkflowTimeline | null;
  projectQueue?: ProjectQueueStateResponse | null;
}) {
  const trust = task.artifactTrust;
  const auditCardDecisionRows = trust?.auditCardDecision
    ? getAuditCardDecisionRows(trust.auditCardDecision)
    : [];
  const memoryCount = task.memoryCandidateCount ?? 0;
  const childSummary = task.childSummary;

  return (
    <div className="space-y-3">
      <DetailRows
        rows={[
          ["Status", task.status],
          ["Auto mode", task.autoMode ? "Enabled" : "Manual"],
          ["Intent", task.taskIntent ?? (task.isFix ? "fix" : "general")],
          ["Hierarchy role", task.hierarchyRole ?? "executable"],
          ["Parent", task.parentTask ? task.parentTask.title : "None"],
          ["Depth", task.hierarchyDepth ?? 0],
          ["Closeout policy", task.parentCloseoutPolicy ?? "None"],
          [
            "Children",
            childSummary
              ? `${childSummary.verifiedChildCount}/${childSummary.childCount} verified, ${childSummary.activeChildCount} active, ${childSummary.blockedChildCount} blocked`
              : "0",
          ],
          ["Artifact trust", trust?.artifactTrustLevel ?? "Not evaluated"],
          ["Next action", trust?.nextActionLabel ?? "None"],
          ["Memory candidates", memoryCount],
          [
            "Project auto queue",
            projectQueue ? (projectQueue.autoQueueMode ? "Enabled" : "Off") : "Unknown",
          ],
          ["Execution active", projectQueue ? (projectQueue.executionActiveCount ?? 0) : "Unknown"],
          [
            "Queue-gating active",
            projectQueue ? (projectQueue.queueGatingActiveCount ?? 0) : "Unknown",
          ],
        ]}
      />
      {trust?.summary && (
        <div className="border border-border/70 bg-muted/20 p-3 text-xs text-muted-foreground">
          {trust.summary}
        </div>
      )}
      {(task.children?.length ?? 0) > 0 && (
        <div className="space-y-2 border border-border/70 bg-muted/20 p-3 text-xs">
          <div className="font-semibold text-foreground">Direct children</div>
          {task.children!.map((child) => (
            <div
              key={child.id}
              className="border-t border-border/50 pt-2 first:border-t-0 first:pt-0"
            >
              <div className="flex min-w-0 items-center justify-between gap-2">
                <div className="min-w-0 truncate font-medium">{child.title}</div>
                <Badge size="xs" variant="outline">
                  {child.status}
                </Badge>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground">
                <span>P{child.priority}</span>
                <span>depth {child.hierarchyDepth}</span>
                <span>position {child.hierarchyPosition}</span>
                {(child.childSummary?.childCount ?? 0) > 0 && (
                  <span>
                    children {child.childSummary?.verifiedChildCount}/
                    {child.childSummary?.childCount} verified
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {auditCardDecisionRows.length > 0 && (
        <div className="border border-border/70 bg-muted/20 p-3 text-xs">
          <div className="mb-2 font-semibold text-foreground">Audit card decision</div>
          <DetailRows rows={auditCardDecisionRows} />
        </div>
      )}
      <div className="grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
        <div className="border border-border/70 bg-background/60 p-2">
          <div className="text-muted-foreground">Artifacts</div>
          <div className="text-lg font-semibold">{timeline?.artifacts.length ?? 0}</div>
        </div>
        <div className="border border-border/70 bg-background/60 p-2">
          <div className="text-muted-foreground">Evidence</div>
          <div className="text-lg font-semibold">{timeline?.evidence.length ?? 0}</div>
        </div>
        <div className="border border-border/70 bg-background/60 p-2">
          <div className="text-muted-foreground">Claims</div>
          <div className="text-lg font-semibold">{timeline?.claims.length ?? 0}</div>
        </div>
        <div className="border border-border/70 bg-background/60 p-2">
          <div className="text-muted-foreground">Events</div>
          <div className="text-lg font-semibold">{timeline?.events.length ?? 0}</div>
        </div>
      </div>
      {(projectQueue?.backlog.length ?? 0) > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold uppercase text-muted-foreground">
            Next Queue Items
          </h4>
          {projectQueue!.backlog.slice(0, 5).map((item) => (
            <div key={item.id} className="border border-border/70 bg-muted/20 p-3 text-xs">
              <div className="font-medium">{item.title}</div>
              <div className="mt-1 text-muted-foreground">
                {item.status} | P{item.priority} | position {item.position}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function TaskDetail({ taskId, onClose }: TaskDetailProps) {
  const { data: task } = useTask(taskId);
  const { data: timeline, isLoading: isTimelineLoading } = useTaskTimeline(taskId);
  const { data: evidenceResponse, isLoading: isEvidenceLoading } = useTaskEvidence(taskId);
  const { data: memoryCandidates, isLoading: isMemoryLoading } = useTaskMemoryCandidates(taskId);
  const { data: taskRuntimeUsage } = useTaskRuntimeUsage(taskId);
  const { data: worktree } = useTaskWorktree(
    taskId,
    Boolean(task?.worktreePath || task?.branchName),
  );
  const { data: projectKnowledge, isLoading: isProjectKnowledgeLoading } = useProjectKnowledge(
    task?.projectId ?? null,
  );
  const { data: projectRuntimeUsage } = useProjectRuntimeUsage(task?.projectId ?? null);
  const { data: projectQueue } = useProjectQueue(task?.projectId ?? null);
  const cleanupTaskWorktree = useCleanupTaskWorktree();
  const [selectedTab, setSelectedTab] = useState<TaskDetailTab | null>(null);
  const actions = useTaskDetailActions(task, onClose);
  const defaultTab: TaskDetailTab = (() => {
    if (!task) return "overview";
    if (task.status === "review") return "review";
    if (task.implementationLog?.trim()) return "implementation";
    if (task.agentActivityLog?.trim()) return "activity";
    return "overview";
  })();
  const activeTab: TaskDetailTab = selectedTab ?? defaultTab;
  const planQuality = task ? getPlanQualityPresentation(task) : null;
  const deleteDisabled = Boolean(
    task &&
    ((task.childSummary?.childCount ?? 0) > 0 ||
      (task.parentTask && !["done", "verified"].includes(task.parentTask.status))),
  );

  return (
    <>
      <Sheet open={!!taskId} onOpenChange={() => onClose()}>
        <SheetContent className="w-full overflow-hidden p-0 md:w-[88vw] md:max-w-none">
          {task && (
            <div className="flex h-full flex-col">
              <TaskDetailHeader
                task={task}
                activeTab={activeTab}
                onTabChange={setSelectedTab}
                onActionClick={actions.handleActionClick}
                onTogglePaused={() =>
                  actions.updateTask.mutate({ id: task.id, input: { paused: !task.paused } })
                }
                isDisabled={actions.isSubmittingPlanChange}
                isCheckingStartAi={actions.isCheckingStartAiPlanFile}
                planChangeSuccess={actions.planChangeSuccess}
                onClose={onClose}
              />

              {task.manualReviewRequired && (
                <div className="px-4 pt-4">
                  <AlertBox variant="warning" className="text-xs">
                    {planQuality?.isTerminal
                      ? "Plan quality retries are exhausted and human review is required. Inspect the blocker reason, edit the task prompt or plan constraints, then retry from blocked."
                      : "Auto-review stopped and human review is required. Inspect the review comments, then use Approve or Request changes to resolve the task."}
                  </AlertBox>
                </div>
              )}

              <div className="grid flex-1 gap-4 overflow-hidden p-4 md:grid-cols-2">
                {/* Left column */}
                <div className="space-y-4 overflow-y-auto pr-1">
                  <Section title="Description">
                    <TaskDescription
                      description={task.description}
                      onSave={(description) =>
                        actions.updateTask.mutate({ id: task.id, input: { description } })
                      }
                    />
                  </Section>

                  <Section title="Attachments">
                    <TaskAttachments
                      taskId={task.id}
                      attachments={task.attachments ?? []}
                      onFilesSelected={(files) => void actions.handleTaskAttachmentsSelected(files)}
                      onRemove={actions.handleRemoveTaskAttachment}
                    />
                  </Section>

                  {task.worktreePath && (
                    <Section title="Worktree">
                      <div className="rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-xs text-foreground break-all">
                        {task.worktreePath}
                      </div>
                    </Section>
                  )}

                  {(task.status === "backlog" || task.status === "done") && (
                    <TaskSettings
                      task={task}
                      onSave={(input) => actions.updateTask.mutate({ id: task.id, input })}
                    />
                  )}

                  <Section
                    title="Plan"
                    actions={
                      task.plan?.trim() ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="xs"
                          onClick={() => actions.setShowSyncPlanConfirm(true)}
                          disabled={actions.syncTaskPlanIsPending}
                        >
                          {actions.syncTaskPlanIsPending ? "Syncing..." : "Sync"}
                        </Button>
                      ) : undefined
                    }
                  >
                    <TaskPlan plan={task.plan} />
                  </Section>

                  <div className="border-t border-border pt-4">
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => actions.setShowDeleteConfirm(true)}
                      disabled={deleteDisabled}
                      title={
                        deleteDisabled
                          ? "Hierarchy tasks with open relationships cannot be deleted"
                          : undefined
                      }
                    >
                      <Trash2 className="mr-1 h-3 w-3" /> Delete task
                    </Button>
                  </div>
                </div>

                {/* Right column */}
                <div className="space-y-4 overflow-y-auto pr-1">
                  {task.autoReviewState && <ReviewBlockerHistory state={task.autoReviewState} />}
                  {activeTab === "overview" && (
                    <Section title="Operator Overview">
                      <OverviewView task={task} timeline={timeline} projectQueue={projectQueue} />
                    </Section>
                  )}
                  {activeTab === "plan" && (
                    <Section
                      title="Plan"
                      actions={
                        task.plan?.trim() ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="xs"
                            onClick={() => actions.setShowSyncPlanConfirm(true)}
                            disabled={actions.syncTaskPlanIsPending}
                          >
                            {actions.syncTaskPlanIsPending ? "Syncing..." : "Sync"}
                          </Button>
                        ) : undefined
                      }
                    >
                      <TaskPlan plan={task.plan} />
                    </Section>
                  )}
                  {activeTab === "implementation" && (
                    <Section title="Implementation Log">
                      <TaskLog log={task.implementationLog} label="Implementation log" />
                    </Section>
                  )}
                  {activeTab === "review" && (
                    <Section title="Review Comments">
                      <TaskLog log={task.reviewComments} label="Review comments" />
                    </Section>
                  )}
                  {activeTab === "comments" && (
                    <Section title="Comments">
                      <TaskComments taskId={task.id} />
                    </Section>
                  )}
                  {activeTab === "activity" && (
                    <Section
                      title="Agent Activity"
                      actions={
                        task.agentActivityLog?.trim() ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="xs"
                            onClick={() => actions.setShowClearActivityConfirm(true)}
                            disabled={actions.updateTaskIsPending}
                          >
                            {actions.updateTaskIsPending ? "Clearing..." : "Clear log"}
                          </Button>
                        ) : undefined
                      }
                    >
                      <AgentTimeline activityLog={task.agentActivityLog} />
                    </Section>
                  )}
                  {activeTab === "timeline" && (
                    <Section title="Timeline">
                      <WorkflowTimelinePanel timeline={timeline} isLoading={isTimelineLoading} />
                    </Section>
                  )}
                  {activeTab === "evidence" && (
                    <Section title="Evidence">
                      <EvidenceView
                        timeline={timeline}
                        evidenceResponse={evidenceResponse}
                        isLoading={isEvidenceLoading}
                      />
                    </Section>
                  )}
                  {activeTab === "artifacts" && (
                    <Section title="Artifacts">
                      <ArtifactsView timeline={timeline} />
                    </Section>
                  )}
                  {activeTab === "memory" && (
                    <Section title="Memory">
                      <MemoryView
                        taskMemory={memoryCandidates}
                        projectKnowledge={projectKnowledge}
                        isLoading={isMemoryLoading || isProjectKnowledgeLoading}
                      />
                    </Section>
                  )}
                  {activeTab === "runtime" && (
                    <Section title="Runtime">
                      <RuntimeView
                        task={task}
                        usage={taskRuntimeUsage}
                        projectUsage={projectRuntimeUsage}
                      />
                    </Section>
                  )}
                  {activeTab === "git" && (
                    <Section title="Git & Worktree">
                      <GitView
                        task={task}
                        worktree={worktree}
                        cleanupPending={cleanupTaskWorktree.isPending}
                        onArchive={() =>
                          cleanupTaskWorktree.mutate({ id: task.id, action: "archive" })
                        }
                        onDelete={() =>
                          cleanupTaskWorktree.mutate({ id: task.id, action: "delete" })
                        }
                      />
                    </Section>
                  )}
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Toast notifications */}
      {actions.maintenanceSuccess && (
        <AlertBox
          variant="success"
          className="fixed bottom-4 left-4 text-xs"
          style={{ zIndex: "var(--z-bubble)" }}
        >
          {actions.maintenanceSuccess}
        </AlertBox>
      )}
      {actions.maintenanceError && (
        <AlertBox
          variant="error"
          className="fixed bottom-4 right-4 text-xs"
          style={{ zIndex: "var(--z-bubble)" }}
        >
          {actions.maintenanceError}
        </AlertBox>
      )}

      {/* Confirm dialogs */}
      <ConfirmDialog
        open={actions.showDeleteConfirm}
        onOpenChange={actions.setShowDeleteConfirm}
        title="Delete task?"
        description={`This action cannot be undone. The task "${task?.title ?? ""}" will be permanently deleted.`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={actions.handleDelete}
      />
      <ConfirmDialog
        open={actions.showClearActivityConfirm}
        onOpenChange={actions.setShowClearActivityConfirm}
        title="Clear agent activity log?"
        description="This action cannot be undone. All agent activity entries for this task will be removed."
        confirmLabel={actions.updateTaskIsPending ? "Clearing..." : "Clear"}
        variant="destructive"
        disabled={actions.updateTaskIsPending}
        onConfirm={actions.handleClearActivityLog}
      />
      <ConfirmDialog
        open={actions.showSyncPlanConfirm}
        onOpenChange={actions.setShowSyncPlanConfirm}
        title="Sync plan from file?"
        description="This will overwrite the current plan in DB with the content from the physical plan file."
        confirmLabel={actions.syncTaskPlanIsPending ? "Syncing..." : "Sync"}
        disabled={actions.syncTaskPlanIsPending}
        onConfirm={actions.handleSyncPlanFromFile}
      />
      <Dialog open={actions.showStartAiConfirm} onOpenChange={actions.setShowStartAiConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Plan file already exists</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            A plan file already exists
            {actions.startAiPlanPath ? ` (${actions.startAiPlanPath})` : ""}.
          </p>
          <div className="mt-4 flex flex-col gap-2">
            <Button
              size="sm"
              onClick={() => {
                actions.setShowStartAiConfirm(false);
                actions.handleAcceptExistingPlan();
              }}
            >
              Use Existing Plan
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                actions.setShowStartAiConfirm(false);
                actions.triggerStartAi({ deletePlanFile: true });
              }}
            >
              Overwrite & Re-plan
            </Button>
            <Button variant="ghost" size="sm" onClick={() => actions.setShowStartAiConfirm(false)}>
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={actions.showApproveDoneConfirm}
        onOpenChange={(next) => {
          // Block dismissing the modal while a commit is in flight so the
          // user waits for the WS ack (commit_done / commit_failed).
          if (!next && actions.commitPending) return;
          actions.setShowApproveDoneConfirm(next);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve done task?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            The task will move from <strong>Done</strong> to <strong>Verified</strong>.
          </p>
          <label className="mt-4 flex items-center gap-2 text-sm">
            <Checkbox
              checked={actions.deletePlanOnApprove}
              onChange={(event) => actions.setDeletePlanOnApprove(event.target.checked)}
              disabled={actions.commitPending}
            />
            Delete plan file ({task?.isFix ? "FIX_PLAN.md" : "PLAN.md"})
          </label>
          <label className="mt-2 flex items-center gap-2 text-sm">
            <Checkbox
              checked={actions.commitOnApprove}
              onChange={(event) => actions.setCommitOnApprove(event.target.checked)}
              disabled={actions.commitPending}
            />
            Create commit (/aif-commit)
          </label>
          {actions.commitPending && (
            <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
              <Spinner size="sm" />
              <span>Running /aif-commit… waiting for server ack.</span>
            </div>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={actions.commitPending}
              onClick={() => {
                actions.setShowApproveDoneConfirm(false);
                actions.setDeletePlanOnApprove(false);
                actions.setCommitOnApprove(true);
              }}
            >
              Cancel
            </Button>
            <Button size="sm" onClick={actions.handleApproveDone} disabled={actions.commitPending}>
              {actions.commitPending ? (
                <span className="flex items-center gap-2">
                  <Spinner size="sm" />
                  Committing…
                </span>
              ) : (
                "Approve"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Plan change dialog */}
      <PlanChangeDialog
        open={actions.showReplanModal}
        mode={actions.planChangeMode}
        comment={actions.replanComment}
        onCommentChange={actions.setReplanComment}
        files={actions.replanFiles}
        onFilesChange={actions.setReplanFiles}
        isSubmitting={actions.isSubmittingPlanChange}
        error={actions.planChangeError}
        onSubmit={actions.handlePlanChangeRequest}
        onCancel={actions.resetReplanModal}
      />
    </>
  );
}
