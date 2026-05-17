import type { Task } from "@aif/shared/browser";

export interface PlanQualityPresentation {
  label: string;
  summary: string;
  isTerminal: boolean;
}

export function getPlanQualityPresentation(task: Task): PlanQualityPresentation | null {
  const blockedReason = task.blockedReason?.trim();
  const reasonCodes = task.artifactTrust?.reasonCodes ?? [];
  const hasPlanQualityReason =
    blockedReason?.startsWith("Plan quality guard") === true ||
    reasonCodes.includes("plan_quality") ||
    reasonCodes.includes("plan_quality_exhausted");
  if (!hasPlanQualityReason) return null;

  const isTerminal =
    task.status === "blocked_external" ||
    task.manualReviewRequired ||
    blockedReason?.includes("Retry limit reached") === true ||
    reasonCodes.includes("plan_quality_exhausted");

  return {
    label: isTerminal ? "Plan quality blocked" : "Plan quality replan",
    summary:
      blockedReason ??
      (isTerminal
        ? "Plan quality guard exhausted retries and requires manual review."
        : "Plan quality guard requested replanning."),
    isTerminal,
  };
}
