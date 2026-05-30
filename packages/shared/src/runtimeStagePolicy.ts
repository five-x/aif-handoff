import type { RuntimeProfile } from "./types.js";
import type { RuntimeStage } from "./constants.js";

export interface RuntimeStageCaps {
  maxToolTurns?: number;
  wallClockMs?: number;
  tokenBudget?: number;
  contextTokens?: number;
  maxOutputTokens?: number;
  maxBudgetUsd?: number;
  retryCount?: number;
  repositoryInspectionToolBudget?: number;
}

export type RuntimeStageCapabilityReason =
  | "allowed"
  | "explicit_stage_allow"
  | "explicit_stage_deny"
  | "allowed_stages_deny"
  | "qwen_implementation_not_enabled"
  | "qwen_implementation_flag"
  | "qwen_implementation_canary";

export interface RuntimeStageCapabilityDecision {
  allowed: boolean;
  reason: RuntimeStageCapabilityReason;
  stage: RuntimeStage;
  profileId: string | null;
  runtimeId: string | null;
  providerId: string | null;
  caps: RuntimeStageCaps;
}

type RuntimeProfileStagePolicyInput = Pick<
  RuntimeProfile,
  "id" | "runtimeId" | "providerId" | "options"
>;

const QWEN_DEFAULT_ALLOWED_STAGES = new Set<RuntimeStage>([
  "researcher",
  "designer",
  "planner",
  "plan_checker",
  "reviewer",
  "qa",
  "security",
  "chat",
  "audit",
  "synthesis",
]);

const QWEN_DEFAULT_STAGE_CAPS: Partial<Record<RuntimeStage, RuntimeStageCaps>> = {
  researcher: {
    maxToolTurns: 8,
    wallClockMs: 10 * 60 * 1000,
    contextTokens: 24_000,
    maxOutputTokens: 2_000,
    retryCount: 0,
    repositoryInspectionToolBudget: 8,
  },
  designer: {
    maxToolTurns: 8,
    wallClockMs: 10 * 60 * 1000,
    contextTokens: 24_000,
    maxOutputTokens: 2_000,
    retryCount: 0,
    repositoryInspectionToolBudget: 8,
  },
  planner: {
    maxToolTurns: 20,
    wallClockMs: 10 * 60 * 1000,
    contextTokens: 24_000,
    maxOutputTokens: 4_000,
    retryCount: 0,
    repositoryInspectionToolBudget: 16,
  },
  plan_checker: {
    maxToolTurns: 8,
    wallClockMs: 8 * 60 * 1000,
    contextTokens: 24_000,
    maxOutputTokens: 1_500,
    retryCount: 0,
    repositoryInspectionToolBudget: 6,
  },
  implementer: {
    maxToolTurns: 12,
    wallClockMs: 15 * 60 * 1000,
    contextTokens: 24_000,
    maxOutputTokens: 4_000,
    retryCount: 0,
    repositoryInspectionToolBudget: 12,
  },
  reviewer: {
    maxToolTurns: 12,
    wallClockMs: 12 * 60 * 1000,
    contextTokens: 24_000,
    maxOutputTokens: 2_000,
    retryCount: 0,
    repositoryInspectionToolBudget: 8,
  },
  qa: {
    maxToolTurns: 12,
    wallClockMs: 12 * 60 * 1000,
    contextTokens: 24_000,
    maxOutputTokens: 2_000,
    retryCount: 0,
    repositoryInspectionToolBudget: 8,
  },
  security: {
    maxToolTurns: 12,
    wallClockMs: 12 * 60 * 1000,
    contextTokens: 24_000,
    maxOutputTokens: 2_000,
    retryCount: 0,
    repositoryInspectionToolBudget: 8,
  },
  audit: {
    maxToolTurns: 20,
    wallClockMs: 18 * 60 * 1000,
    contextTokens: 24_000,
    maxOutputTokens: 4_000,
    retryCount: 0,
    repositoryInspectionToolBudget: 16,
  },
  synthesis: {
    maxToolTurns: 20,
    wallClockMs: 18 * 60 * 1000,
    contextTokens: 24_000,
    maxOutputTokens: 4_000,
    retryCount: 0,
    repositoryInspectionToolBudget: 16,
  },
};

const CAP_ALIASES: Record<keyof RuntimeStageCaps, string[]> = {
  maxToolTurns: ["maxToolTurns", "toolTurns", "max_tool_turns"],
  wallClockMs: ["wallClockMs", "timeoutMs", "runTimeoutMs", "wall_clock_ms"],
  tokenBudget: ["tokenBudget", "maxTokensTotal", "token_budget"],
  contextTokens: ["contextTokens", "contextWindowTokens", "maxInputTokens", "context_tokens"],
  maxOutputTokens: ["maxOutputTokens", "maxTokens", "max_output_tokens"],
  maxBudgetUsd: ["maxBudgetUsd", "budgetUsd", "max_budget_usd"],
  retryCount: ["retryCount", "maxRetries", "retry_count"],
  repositoryInspectionToolBudget: [
    "repositoryInspectionToolBudget",
    "inspectionToolBudget",
    "repository_inspection_tool_budget",
  ],
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readPositiveNumber(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return undefined;
  return value;
}

function readPositiveInteger(value: unknown): number | undefined {
  const parsed = readPositiveNumber(value);
  return parsed === undefined ? undefined : Math.floor(parsed);
}

function readCapObject(
  options: Record<string, unknown>,
  stage: RuntimeStage,
): Record<string, unknown> {
  return {
    ...asRecord(asRecord(options.stageCaps)[stage]),
    ...asRecord(asRecord(options.runtimeStageCaps)[stage]),
    ...asRecord(asRecord(asRecord(options.qwenLocalAgent).stageCaps)[stage]),
  };
}

function readConfiguredCaps(
  options: Record<string, unknown>,
  stage: RuntimeStage,
): RuntimeStageCaps {
  const source = readCapObject(options, stage);
  const caps: RuntimeStageCaps = {};
  for (const [capKey, aliases] of Object.entries(CAP_ALIASES) as Array<
    [keyof RuntimeStageCaps, string[]]
  >) {
    for (const alias of aliases) {
      const parsed =
        capKey === "maxBudgetUsd"
          ? readPositiveNumber(source[alias])
          : readPositiveInteger(source[alias]);
      if (parsed !== undefined) {
        caps[capKey] = parsed;
        break;
      }
    }
  }
  return caps;
}

function mergeStrictCaps(
  defaults: RuntimeStageCaps,
  configured: RuntimeStageCaps,
): RuntimeStageCaps {
  const merged: RuntimeStageCaps = { ...defaults };
  for (const key of Object.keys(configured) as Array<keyof RuntimeStageCaps>) {
    const configuredValue = configured[key];
    if (configuredValue === undefined) continue;
    const defaultValue = merged[key];
    merged[key] =
      defaultValue === undefined ? configuredValue : Math.min(defaultValue, configuredValue);
  }
  return merged;
}

function readStageCapability(
  options: Record<string, unknown>,
  stage: RuntimeStage,
): boolean | null {
  const raw = asRecord(options.stageCapabilities)[stage];
  if (typeof raw === "boolean") return raw;
  const record = asRecord(raw);
  if (typeof record.enabled === "boolean") return record.enabled;
  if (typeof record.allowed === "boolean") return record.allowed;
  if (typeof record.capable === "boolean") return record.capable;
  return null;
}

function readAllowedStages(options: Record<string, unknown>): Set<string> | null {
  const raw = options.allowedStages;
  if (!Array.isArray(raw)) return null;
  const stages = raw.filter((stage): stage is string => typeof stage === "string");
  return new Set(stages);
}

function readBooleanPath(record: Record<string, unknown>, path: string[]): boolean {
  let current: unknown = record;
  for (const key of path) {
    current = asRecord(current)[key];
  }
  return current === true;
}

export function isQwenLocalRuntimeProfile(profile: RuntimeProfileStagePolicyInput): boolean {
  const runtimeId = profile.runtimeId.trim().toLowerCase();
  const providerId = profile.providerId.trim().toLowerCase();
  return (
    runtimeId === "qwen-local-agent" ||
    providerId === "qwen" ||
    providerId === "qwen-local" ||
    providerId === "qwen_local"
  );
}

function qwenImplementationOptInReason(
  options: Record<string, unknown>,
  explicitStageCapability: boolean | null,
): RuntimeStageCapabilityReason | null {
  if (explicitStageCapability === true) return "explicit_stage_allow";

  const qwenOptions = asRecord(options.qwenLocalAgent);
  if (
    qwenOptions.allowImplementation === true ||
    qwenOptions.implementationEnabled === true ||
    qwenOptions.implementationCapable === true
  ) {
    return "qwen_implementation_flag";
  }

  if (
    qwenOptions.implementationCanaryPassed === true ||
    readBooleanPath(qwenOptions, ["implementationCanary", "passed"]) ||
    readBooleanPath(qwenOptions, ["canary", "implementation", "passed"])
  ) {
    return "qwen_implementation_canary";
  }

  return null;
}

export function getRuntimeStageCaps(
  profile: RuntimeProfileStagePolicyInput,
  stage: RuntimeStage,
): RuntimeStageCaps {
  const options = asRecord(profile.options);
  const configured = readConfiguredCaps(options, stage);
  if (!isQwenLocalRuntimeProfile(profile)) return configured;
  return mergeStrictCaps(QWEN_DEFAULT_STAGE_CAPS[stage] ?? {}, configured);
}

export function evaluateRuntimeProfileStageCapability(
  profile: RuntimeProfileStagePolicyInput,
  stage: RuntimeStage,
): RuntimeStageCapabilityDecision {
  const options = asRecord(profile.options);
  const explicitStageCapability = readStageCapability(options, stage);
  const allowedStages = readAllowedStages(options);
  const caps = getRuntimeStageCaps(profile, stage);

  if (explicitStageCapability === false) {
    return {
      allowed: false,
      reason: "explicit_stage_deny",
      stage,
      profileId: profile.id ?? null,
      runtimeId: profile.runtimeId,
      providerId: profile.providerId,
      caps,
    };
  }

  if (allowedStages && !allowedStages.has(stage)) {
    return {
      allowed: false,
      reason: "allowed_stages_deny",
      stage,
      profileId: profile.id ?? null,
      runtimeId: profile.runtimeId,
      providerId: profile.providerId,
      caps,
    };
  }

  if (isQwenLocalRuntimeProfile(profile) && stage === "implementer") {
    const optInReason = qwenImplementationOptInReason(options, explicitStageCapability);
    return {
      allowed: optInReason !== null,
      reason: optInReason ?? "qwen_implementation_not_enabled",
      stage,
      profileId: profile.id ?? null,
      runtimeId: profile.runtimeId,
      providerId: profile.providerId,
      caps,
    };
  }

  if (isQwenLocalRuntimeProfile(profile) && !QWEN_DEFAULT_ALLOWED_STAGES.has(stage)) {
    return {
      allowed: explicitStageCapability === true,
      reason: explicitStageCapability === true ? "explicit_stage_allow" : "allowed_stages_deny",
      stage,
      profileId: profile.id ?? null,
      runtimeId: profile.runtimeId,
      providerId: profile.providerId,
      caps,
    };
  }

  return {
    allowed: true,
    reason: explicitStageCapability === true ? "explicit_stage_allow" : "allowed",
    stage,
    profileId: profile.id ?? null,
    runtimeId: profile.runtimeId,
    providerId: profile.providerId,
    caps,
  };
}

export function isRuntimeProfileAllowedForStage(
  profile: RuntimeProfileStagePolicyInput,
  stage: RuntimeStage,
): boolean {
  return evaluateRuntimeProfileStageCapability(profile, stage).allowed;
}
