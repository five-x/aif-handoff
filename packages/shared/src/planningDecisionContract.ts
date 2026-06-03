import { createHash } from "node:crypto";
import type { TaskIntent } from "./taskIntent.js";

export const AIF_PLANNING_DECISION_FENCE_LANGUAGE = "aif-planning-decision";
export const AIF_PLANNING_DECISIONS = [
  "ready_plan",
  "split_required",
  "needs_input",
  "blocked",
] as const;
export const AIF_PLANNING_DECISION_CHILD_INTENTS = [
  "feature",
  "fix",
  "docs",
  "tests",
  "audit",
] as const;

export type AifPlanningDecisionKind = (typeof AIF_PLANNING_DECISIONS)[number];
export type AifPlanningDecisionChildIntent = (typeof AIF_PLANNING_DECISION_CHILD_INTENTS)[number];

export interface AifPlanningDecisionChild {
  title: string;
  taskIntent: AifPlanningDecisionChildIntent;
  scope: string[];
  acceptanceCriteria: string[];
  verificationCommands: string[];
  forbiddenChanges: string[];
}

export interface AifPlanningDecisionContract {
  decision: AifPlanningDecisionKind;
  taskId: string;
  reason: string;
  proposedChildren: AifPlanningDecisionChild[];
}

export class PlanningDecisionContractError extends Error {
  issues: string[];

  constructor(issues: string[]) {
    super(`Invalid aif-planning-decision contract: ${issues.join("; ")}`);
    this.name = "PlanningDecisionContractError";
    this.issues = issues;
  }
}

export interface ParseAifPlanningDecisionContractInput {
  text: string;
  taskId: string;
}

const DECISION_BLOCK_PATTERN = /```aif-planning-decision\b[^\r\n]*\r?\n([\s\S]*?)```/gi;
const BROAD_OR_WILDCARD_SCOPE_PATTERN =
  /(?:^|\/)(?:\*\*?|\*)$|[*{}[\]]|^(?:\.?\/)?(?:repo|repository|project|codebase|app|application|src|packages|apps|tests?|docs?)$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPlanningDecision(value: unknown): value is AifPlanningDecisionKind {
  return (
    typeof value === "string" && AIF_PLANNING_DECISIONS.includes(value as AifPlanningDecisionKind)
  );
}

function isPlanningChildIntent(value: unknown): value is AifPlanningDecisionChildIntent {
  return (
    typeof value === "string" &&
    AIF_PLANNING_DECISION_CHILD_INTENTS.includes(value as AifPlanningDecisionChildIntent)
  );
}

function normalizeNonEmptyString(value: unknown, label: string, issues: string[]): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    issues.push(`${label} must be a non-empty string`);
    return "";
  }
  return value.trim();
}

function normalizeStringArray(value: unknown, label: string, issues: string[]): string[] {
  if (!Array.isArray(value)) {
    issues.push(`${label} must be a non-empty string array`);
    return [];
  }
  const entries = [
    ...new Set(
      value
        .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
        .filter((entry) => entry.length > 0),
    ),
  ];
  if (entries.length === 0) {
    issues.push(`${label} must be a non-empty string array`);
  }
  return entries;
}

function normalizeScopeArray(value: unknown, label: string, issues: string[]): string[] {
  const entries = normalizeStringArray(value, label, issues).map((entry) =>
    entry
      .replaceAll("\\", "/")
      .replace(/^\.\/+/, "")
      .replace(/\/+$/g, ""),
  );
  for (const entry of entries) {
    if (BROAD_OR_WILDCARD_SCOPE_PATTERN.test(entry)) {
      issues.push(`${label} must contain concrete file paths; invalid entry: ${entry}`);
    }
  }
  return entries;
}

function normalizeProposedChild(
  value: unknown,
  index: number,
  issues: string[],
): AifPlanningDecisionChild | null {
  if (!isRecord(value)) {
    issues.push(`proposedChildren[${index}] must be an object`);
    return null;
  }
  const title = normalizeNonEmptyString(value.title, `proposedChildren[${index}].title`, issues);
  const taskIntent = value.taskIntent;
  if (!isPlanningChildIntent(taskIntent)) {
    issues.push(
      `proposedChildren[${index}].taskIntent must be one of ${AIF_PLANNING_DECISION_CHILD_INTENTS.join(", ")}`,
    );
  }
  const scope = normalizeScopeArray(value.scope, `proposedChildren[${index}].scope`, issues);
  const acceptanceCriteria = normalizeStringArray(
    value.acceptanceCriteria,
    `proposedChildren[${index}].acceptanceCriteria`,
    issues,
  );
  const verificationCommands = normalizeStringArray(
    value.verificationCommands,
    `proposedChildren[${index}].verificationCommands`,
    issues,
  );
  const forbiddenChanges = normalizeStringArray(
    value.forbiddenChanges,
    `proposedChildren[${index}].forbiddenChanges`,
    issues,
  );
  if (!title || !isPlanningChildIntent(taskIntent)) return null;
  return {
    title,
    taskIntent,
    scope,
    acceptanceCriteria,
    verificationCommands,
    forbiddenChanges,
  };
}

function extractPlanningDecisionBlocks(text: string): string[] {
  DECISION_BLOCK_PATTERN.lastIndex = 0;
  return [...text.matchAll(DECISION_BLOCK_PATTERN)].map((match) => match[1] ?? "");
}

export function stripAifPlanningDecisionBlocks(text: string): string {
  DECISION_BLOCK_PATTERN.lastIndex = 0;
  return text.replace(DECISION_BLOCK_PATTERN, "").trim();
}

export function parseAifPlanningDecisionContract(
  input: ParseAifPlanningDecisionContractInput,
): AifPlanningDecisionContract {
  const blocks = extractPlanningDecisionBlocks(input.text);
  const issues: string[] = [];
  if (blocks.length === 0) {
    throw new PlanningDecisionContractError(["missing_aif_planning_decision"]);
  }
  if (blocks.length > 1) {
    throw new PlanningDecisionContractError(["multiple_aif_planning_decision_blocks"]);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(blocks[0] ?? "");
  } catch (error) {
    throw new PlanningDecisionContractError([
      `invalid_json: ${error instanceof Error ? error.message : String(error)}`,
    ]);
  }

  if (!isRecord(parsed)) {
    throw new PlanningDecisionContractError(["decision block must be a JSON object"]);
  }

  const decision = parsed.decision;
  if (!isPlanningDecision(decision)) {
    issues.push(`decision must be one of ${AIF_PLANNING_DECISIONS.join(", ")}`);
  }
  const taskId = normalizeNonEmptyString(parsed.taskId, "taskId", issues);
  if (taskId && taskId !== input.taskId) {
    issues.push(`taskId mismatch: expected ${input.taskId}, got ${taskId}`);
  }
  const reason = normalizeNonEmptyString(parsed.reason, "reason", issues);
  const rawChildren = parsed.proposedChildren;
  if (!Array.isArray(rawChildren)) {
    issues.push("proposedChildren must be an array");
  }
  const proposedChildren = Array.isArray(rawChildren)
    ? rawChildren
        .map((child, index) => normalizeProposedChild(child, index, issues))
        .filter((child): child is AifPlanningDecisionChild => child !== null)
    : [];

  if (decision === "split_required" && proposedChildren.length === 0) {
    issues.push("split_required requires at least one proposed child");
  }
  if (issues.length > 0) {
    throw new PlanningDecisionContractError(issues);
  }

  return {
    decision: decision as AifPlanningDecisionKind,
    taskId,
    reason,
    proposedChildren,
  };
}

export function buildPlanningDecisionFingerprint(input: {
  taskId: string;
  title: string;
  description?: string | null;
  plannerMode?: string | null;
  taskIntent?: TaskIntent | null;
  decision: AifPlanningDecisionContract;
}): string {
  const payload = JSON.stringify({
    taskId: input.taskId,
    title: input.title,
    description: input.description ?? "",
    plannerMode: input.plannerMode ?? null,
    taskIntent: input.taskIntent ?? null,
    decision: input.decision,
  });
  return createHash("sha256").update(payload).digest("hex");
}
