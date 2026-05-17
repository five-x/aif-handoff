import type { Task, TaskEvent, TaskIntent, TaskStatus } from "@aif/shared/browser";
import {
  STATUS_CONFIG,
  TASK_INTENT_CONTRACTS,
  formatTaskIntentPrimaryConstraints,
} from "@aif/shared/browser";
import { statusColorStyle } from "@/hooks/useStatusColor";
import { Pause, Play, Clock, AlertTriangle } from "lucide-react";
import { SheetHeader, SheetTitle, SheetClose } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { TaskTagsList } from "@/components/ui/task-tags-list";
import { Button } from "@/components/ui/button";
import { formatTokenCount, formatUsd } from "@/lib/formatters";
import { Tabs } from "@/components/ui/tabs";
import { AlertBox } from "@/components/ui/alert-box";
import { getRuntimeLimitDisplay } from "@/lib/runtimeLimits";
import { getArtifactTrustPresentation } from "@/lib/artifactTrust";
import { getPlanQualityPresentation } from "@/lib/planQuality";
import { useUsageLimitsEnabled } from "@/hooks/useSettings";

export type TaskDetailTab =
  | "overview"
  | "plan"
  | "implementation"
  | "review"
  | "timeline"
  | "evidence"
  | "artifacts"
  | "memory"
  | "runtime"
  | "git"
  | "comments"
  | "activity";

const ACTION_BUTTONS_BY_STATUS: Partial<
  Record<
    TaskStatus,
    Array<{
      label: string;
      event?: TaskEvent;
      actionType?: "event" | "open_replanning" | "open_fast_fix" | "open_request_changes";
      variant?: "default" | "outline";
      visible?: (task: { autoMode: boolean }) => boolean;
    }>
  >
> = {
  backlog: [{ label: "Start AI", event: "start_ai" }],
  plan_ready: [
    {
      label: "Start implementation",
      event: "start_implementation",
      actionType: "event",
      visible: (task) => !task.autoMode,
    },
    {
      label: "Request replanning",
      actionType: "open_replanning",
      variant: "outline",
      visible: (task) => !task.autoMode,
    },
    {
      label: "Fast fix",
      actionType: "open_fast_fix",
      variant: "outline",
      visible: (task) => !task.autoMode,
    },
  ],
  blocked_external: [{ label: "Retry", event: "retry_from_blocked" }],
  done: [
    { label: "Approve", event: "approve_done" },
    { label: "Request changes", actionType: "open_request_changes", variant: "outline" },
  ],
};

function resolveDisplayIntent(task: Task): TaskIntent {
  return task.taskIntent ?? (task.isFix ? "fix" : "general");
}

interface TaskDetailHeaderProps {
  task: Task;
  activeTab: TaskDetailTab;
  onTabChange: (tab: TaskDetailTab) => void;
  onActionClick: (action: { event?: TaskEvent; actionType?: string }) => void;
  onTogglePaused: () => void;
  isDisabled: boolean;
  isCheckingStartAi: boolean;
  planChangeSuccess: string | null;
  onClose: () => void;
}

export function TaskDetailHeader({
  task,
  activeTab,
  onTabChange,
  onActionClick,
  onTogglePaused,
  isDisabled,
  isCheckingStartAi,
  planChangeSuccess,
  onClose,
}: TaskDetailHeaderProps) {
  const visibleActions = (ACTION_BUTTONS_BY_STATUS[task.status] ?? []).filter(
    (action) => action.visible?.(task) ?? true,
  );
  const usageLimitsEnabled = useUsageLimitsEnabled();
  const runtimeLimitDisplay = usageLimitsEnabled
    ? getRuntimeLimitDisplay(task.runtimeLimitSnapshot, {
        taskRetryAfter: task.retryAfter ?? null,
        checkedAt: task.runtimeLimitUpdatedAt ?? null,
      })
    : null;
  const artifactTrust = getArtifactTrustPresentation(task.artifactTrust);
  const planQuality = getPlanQualityPresentation(task);
  const taskIntent = resolveDisplayIntent(task);
  const taskIntentContract = TASK_INTENT_CONTRACTS[taskIntent];
  const taskIntentConstraints = formatTaskIntentPrimaryConstraints(taskIntent);
  // Pause is also shown in `backlog` so users can park a task that auto-queue
  // would otherwise advance — paused backlog tasks are skipped by both the
  // scheduler and the auto-queue advancer.
  const showPauseButton = !["done", "verified"].includes(task.status);

  return (
    <div className="border-b border-border p-6 pb-4 pr-14">
      <SheetClose onClose={onClose} />
      <SheetHeader className="mb-3">
        <div className="mb-1 flex items-center gap-2">
          <Badge size="sm" style={statusColorStyle(task.status)}>
            {STATUS_CONFIG[task.status].label}
          </Badge>
          {task.manualReviewRequired && (
            <Badge
              size="sm"
              className="border-amber-500/35 bg-amber-500/15 text-amber-700 dark:text-amber-300"
            >
              MANUAL REVIEW
            </Badge>
          )}
          {task.paused && (
            <Badge
              size="sm"
              className="border-yellow-500/35 bg-yellow-500/15 text-yellow-600 dark:text-yellow-300"
            >
              PAUSED
            </Badge>
          )}
          {artifactTrust && (
            <Badge size="sm" className={artifactTrust.className}>
              {artifactTrust.label}
            </Badge>
          )}
          {planQuality && (
            <Badge
              size="sm"
              className={
                planQuality.isTerminal
                  ? "border-red-500/35 bg-red-500/15 text-red-700 dark:text-red-300"
                  : "border-amber-500/35 bg-amber-500/15 text-amber-700 dark:text-amber-300"
              }
            >
              PLAN QUALITY
            </Badge>
          )}
          {task.priority > 0 && (
            <Badge variant="outline" size="sm">
              P{task.priority}
            </Badge>
          )}
          <Badge variant="outline" size="sm">
            {taskIntentContract.label}
          </Badge>
          <TaskTagsList tags={task.tags} roadmapAlias={task.roadmapAlias ?? undefined} />
        </div>
        {task.scheduledAt && task.status === "backlog" && (
          <div className="mb-2 inline-flex items-center gap-1.5 border border-sky-500/30 bg-sky-500/10 px-2 py-1 text-xs text-sky-700 dark:text-sky-300">
            <Clock className="h-3.5 w-3.5 shrink-0" />
            <span>
              Scheduled to start{" "}
              <span className="font-medium">{new Date(task.scheduledAt).toLocaleString()}</span>
            </span>
          </div>
        )}
        <div className="mb-2 flex flex-wrap gap-1.5">
          <Badge variant="outline" size="sm">
            in: {formatTokenCount(task.tokenInput)}
          </Badge>
          <Badge variant="outline" size="sm">
            out: {formatTokenCount(task.tokenOutput)}
          </Badge>
          <Badge variant="outline" size="sm">
            total: {formatTokenCount(task.tokenTotal)}
          </Badge>
          <Badge variant="outline" size="sm">
            cost: {formatUsd(task.costUsd)}
          </Badge>
        </div>
        <SheetTitle className="tracking-tight">{task.title}</SheetTitle>
        <div className="mt-2 border border-border/60 bg-muted/20 px-3 py-2 text-xs">
          <div className="font-medium text-foreground">{taskIntentContract.decomposition}</div>
          <div className="mt-1 text-muted-foreground">
            Primary constraints: {taskIntentConstraints}
          </div>
        </div>
      </SheetHeader>

      {task.status === "blocked_external" && runtimeLimitDisplay && (
        <AlertBox
          variant={runtimeLimitDisplay.tone}
          className="mb-3 flex flex-col gap-1 px-3 py-2 text-xs"
          icon={<AlertTriangle className="h-3.5 w-3.5" />}
        >
          <span className="font-medium">
            {runtimeLimitDisplay.state === "active"
              ? "Auto-paused by runtime limit."
              : "Provider runtime signal is not actively gating this task."}
          </span>
          <span>{runtimeLimitDisplay.summary}</span>
          {runtimeLimitDisplay.resetText && <span>{runtimeLimitDisplay.resetText}</span>}
          {runtimeLimitDisplay.taskRetryText && <span>{runtimeLimitDisplay.taskRetryText}</span>}
        </AlertBox>
      )}

      {planQuality && (
        <AlertBox
          variant={planQuality.isTerminal ? "error" : "warning"}
          className="mb-3 px-3 py-2 text-xs"
          icon={<AlertTriangle className="h-3.5 w-3.5" />}
        >
          <div className="font-medium">{planQuality.label}</div>
          <div className="mt-1 text-muted-foreground">{planQuality.summary}</div>
        </AlertBox>
      )}

      {task.artifactTrust && (
        <AlertBox
          variant={task.artifactTrust.trustedSynthesisInput ? "success" : "warning"}
          className="mb-3 px-3 py-2 text-xs"
        >
          <div className="font-medium">{task.artifactTrust.summary}</div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground">
            <span>Role: {task.artifactTrust.artifactRole}</span>
            <span>State: {task.artifactTrust.artifactState}</span>
            <span>Trust: {task.artifactTrust.artifactTrustLevel}</span>
            <span>Claim: {task.artifactTrust.claimOutcome}</span>
            <span>Next: {task.artifactTrust.nextActionLabel}</span>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground">
            <span>Sources: {task.artifactTrust.batchCounts.total}</span>
            <span>Trusted: {task.artifactTrust.batchCounts.trustedValid}</span>
            <span>Inconclusive: {task.artifactTrust.batchCounts.inconclusive}</span>
            <span>Rejected: {task.artifactTrust.batchCounts.rejected}</span>
            <span>Missing: {task.artifactTrust.batchCounts.missing}</span>
            <span>External: {task.artifactTrust.batchCounts.externalBlocked}</span>
            <span>Synthesis pending: {task.artifactTrust.batchCounts.synthesisPending}</span>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 font-mono text-3xs text-muted-foreground">
            <span>batch {task.artifactTrust.batchId}</span>
            {task.artifactTrust.artifactPath && <span>{task.artifactTrust.artifactPath}</span>}
            {task.artifactTrust.failureSignature && (
              <span>{task.artifactTrust.failureSignature}</span>
            )}
            {task.artifactTrust.branchName && <span>{task.artifactTrust.branchName}</span>}
            {task.artifactTrust.worktreePath && <span>{task.artifactTrust.worktreePath}</span>}
          </div>
          {task.artifactTrust.reasonCodes.length > 0 && (
            <div className="mt-1 text-muted-foreground">
              Reasons: {task.artifactTrust.reasonCodes.join(", ")}
            </div>
          )}
        </AlertBox>
      )}

      {(showPauseButton || visibleActions.length > 0) && (
        <div className="border border-border bg-background/60 p-3">
          <label className="mb-2 block text-xs text-muted-foreground">Actions</label>
          <div className="flex flex-wrap items-center gap-2">
            {showPauseButton && (
              <Button
                variant={task.paused ? "default" : "outline"}
                size="sm"
                className="gap-1.5"
                onClick={onTogglePaused}
                disabled={isDisabled}
              >
                {task.paused ? (
                  <>
                    <Play className="h-3.5 w-3.5" /> Resume
                  </>
                ) : (
                  <>
                    <Pause className="h-3.5 w-3.5" /> Pause
                  </>
                )}
              </Button>
            )}
            {visibleActions.map((action) => (
              <Button
                key={action.event ?? action.label}
                size="sm"
                variant={action.variant}
                onClick={() => onActionClick(action)}
                disabled={isDisabled || isCheckingStartAi}
              >
                {action.event === "start_ai" && isCheckingStartAi ? "Checking..." : action.label}
              </Button>
            ))}
          </div>
          {planChangeSuccess && (
            <AlertBox variant="success" className="mt-2 px-2 py-1.5 text-xs">
              {planChangeSuccess}
            </AlertBox>
          )}
        </div>
      )}

      <Tabs
        className="mt-3 border border-border bg-background/55 p-2"
        items={[
          { value: "overview", label: "Overview" },
          { value: "plan", label: "Plan" },
          { value: "implementation", label: "Implementation" },
          { value: "review", label: "Review" },
          { value: "timeline", label: "Timeline" },
          { value: "evidence", label: "Evidence" },
          { value: "artifacts", label: "Artifacts" },
          { value: "memory", label: "Memory" },
          { value: "runtime", label: "Runtime" },
          { value: "git", label: "Git" },
          { value: "comments", label: "Comments" },
          { value: "activity", label: "Activity" },
        ]}
        value={activeTab}
        onValueChange={(v) => onTabChange(v as TaskDetailTab)}
      />
    </div>
  );
}
