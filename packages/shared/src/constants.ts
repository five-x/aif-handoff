import type { TaskStatus } from "./types.js";

export const STATUS_CONFIG: Record<TaskStatus, { label: string; color: string; order: number }> = {
  backlog: { label: "Backlog", color: "#6B7280", order: 0 },
  requirements_analysis: { label: "Requirements", color: "#0EA5E9", order: 1 },
  needs_input: { label: "Needs Input", color: "#F97316", order: 2 },
  planning: { label: "Planning", color: "#F59E0B", order: 3 },
  plan_ready: { label: "Plan Ready", color: "#3B82F6", order: 4 },
  implementing: { label: "Implementing", color: "#8B5CF6", order: 5 },
  review: { label: "Review", color: "#EC4899", order: 6 },
  blocked_external: { label: "Blocked", color: "#EF4444", order: 7 },
  done: { label: "Done", color: "#10B981", order: 8 },
  verified: { label: "Verified", color: "#14B8A6", order: 9 },
};

export const ORDERED_STATUSES: TaskStatus[] = [
  "backlog",
  "requirements_analysis",
  "needs_input",
  "planning",
  "plan_ready",
  "implementing",
  "review",
  "blocked_external",
  "done",
  "verified",
];

export const WARMUP_TARGETS = [
  { stage: "planner", workflowKind: "planner", profileMode: "plan" },
  { stage: "implementer", workflowKind: "implementer", profileMode: "task" },
  { stage: "reviewer", workflowKind: "reviewer", profileMode: "review" },
  { stage: "security", workflowKind: "review-security", profileMode: "review" },
  { stage: "audit", workflowKind: "audit", profileMode: "plan" },
  { stage: "synthesis", workflowKind: "synthesis", profileMode: "plan" },
] as const;

export const WARMUP_WORKFLOW_KINDS = [
  "planner",
  "implementer",
  "reviewer",
  // Security review uses the review profile/mode but keeps a separate stage seed.
  "review-security",
  "audit",
  "synthesis",
] as const;

export const RUNTIME_PROFILE_MODES = ["task", "plan", "review", "chat"] as const;
export type RuntimeProfileMode = (typeof RUNTIME_PROFILE_MODES)[number];

export const RUNTIME_STAGES = [
  "planner",
  "plan_checker",
  "implementer",
  "reviewer",
  "security",
  "chat",
  "audit",
  "synthesis",
] as const;
export type RuntimeStage = (typeof RUNTIME_STAGES)[number];
export type RuntimeStageOrProfileMode = RuntimeStage | RuntimeProfileMode;

export const RUNTIME_STAGE_PROFILE_MODE: Record<RuntimeStage, RuntimeProfileMode> = {
  planner: "plan",
  plan_checker: "plan",
  implementer: "task",
  reviewer: "review",
  security: "review",
  chat: "chat",
  audit: "plan",
  synthesis: "plan",
};

export function isRuntimeProfileMode(value: unknown): value is RuntimeProfileMode {
  return typeof value === "string" && RUNTIME_PROFILE_MODES.includes(value as RuntimeProfileMode);
}

export function isRuntimeStage(value: unknown): value is RuntimeStage {
  return typeof value === "string" && RUNTIME_STAGES.includes(value as RuntimeStage);
}

export function normalizeRuntimeStage(value: RuntimeStageOrProfileMode): RuntimeStage {
  if (isRuntimeStage(value)) return value;
  const mode = value as RuntimeProfileMode;
  if (mode === "plan") return "planner";
  if (mode === "review") return "reviewer";
  if (mode === "chat") return "chat";
  return "implementer";
}

export function runtimeProfileModeForStage(stage: RuntimeStageOrProfileMode): RuntimeProfileMode {
  return isRuntimeProfileMode(stage) ? stage : RUNTIME_STAGE_PROFILE_MODE[stage];
}

export type WarmupTarget = (typeof WARMUP_TARGETS)[number];
export type WarmupWorkflowKind = (typeof WARMUP_WORKFLOW_KINDS)[number];
export type WarmupProfileMode = WarmupTarget["profileMode"];

export const DEFAULT_WARMUP_TARGET = WARMUP_TARGETS[0];

export function isWarmupWorkflowKind(
  workflowKind: string | null | undefined,
): workflowKind is WarmupWorkflowKind {
  return WARMUP_WORKFLOW_KINDS.some((kind) => kind === workflowKind);
}
