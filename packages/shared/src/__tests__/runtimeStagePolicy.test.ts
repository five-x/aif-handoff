import { describe, expect, it } from "vitest";
import {
  evaluateRuntimeProfileStageCapability,
  getRuntimeStageCaps,
  isRuntimeProfileAllowedForStage,
  type RuntimeProfile,
} from "../index.js";

function profile(overrides: Partial<RuntimeProfile> = {}): RuntimeProfile {
  return {
    id: "profile-qwen",
    projectId: "project-1",
    name: "Qwen",
    runtimeId: "qwen-local-agent",
    providerId: "qwen",
    transport: "api",
    baseUrl: "http://qwen.local/v1",
    apiKeyEnvVar: null,
    defaultModel: "Qwen3-32B-Q4_K_M.gguf",
    headers: {},
    options: {},
    enabled: true,
    runtimeLimitSnapshot: null,
    runtimeLimitUpdatedAt: null,
    lastUsage: null,
    lastUsageAt: null,
    createdAt: "2026-05-30T00:00:00.000Z",
    updatedAt: "2026-05-30T00:00:00.000Z",
    ...overrides,
  };
}

describe("runtime stage policy", () => {
  it("denies qwen-local-agent implementation by default", () => {
    const decision = evaluateRuntimeProfileStageCapability(profile(), "implementer");

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("qwen_implementation_not_enabled");
    expect(decision.caps.maxToolTurns).toBe(12);
    expect(decision.caps.retryCount).toBe(0);
  });

  it("allows qwen-local-agent implementation with an explicit stage flag", () => {
    const decision = evaluateRuntimeProfileStageCapability(
      profile({ options: { stageCapabilities: { implementer: { enabled: true } } } }),
      "implementer",
    );

    expect(decision.allowed).toBe(true);
    expect(decision.reason).toBe("explicit_stage_allow");
  });

  it("allows qwen-local-agent implementation with canary evidence", () => {
    const decision = evaluateRuntimeProfileStageCapability(
      profile({ options: { qwenLocalAgent: { implementationCanary: { passed: true } } } }),
      "implementer",
    );

    expect(decision.allowed).toBe(true);
    expect(decision.reason).toBe("qwen_implementation_canary");
  });

  it("lets explicit stage deny override otherwise allowed stages", () => {
    const decision = evaluateRuntimeProfileStageCapability(
      profile({
        options: {
          qwenLocalAgent: { allowImplementation: true },
          stageCapabilities: { implementer: false },
        },
      }),
      "implementer",
    );

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("explicit_stage_deny");
  });

  it("keeps qwen planning, review, and chat stages allowed by default", () => {
    expect(isRuntimeProfileAllowedForStage(profile(), "planner")).toBe(true);
    expect(isRuntimeProfileAllowedForStage(profile(), "reviewer")).toBe(true);
    expect(isRuntimeProfileAllowedForStage(profile(), "chat")).toBe(true);
  });

  it("gives qwen planner enough tool budget for bounded replanning", () => {
    const caps = getRuntimeStageCaps(profile(), "planner");

    expect(caps.maxToolTurns).toBe(20);
    expect(caps.maxOutputTokens).toBe(4_000);
    expect(caps.repositoryInspectionToolBudget).toBe(16);
  });

  it("parses configured caps and keeps qwen defaults strict", () => {
    const caps = getRuntimeStageCaps(
      profile({
        options: {
          runtimeStageCaps: {
            implementer: {
              maxToolTurns: 40,
              wallClockMs: 2_000_000,
              contextWindowTokens: 16_000,
              maxOutputTokens: 8_000,
              maxBudgetUsd: 1.25,
              retryCount: 3,
              repositoryInspectionToolBudget: 5,
            },
          },
        },
      }),
      "implementer",
    );

    expect(caps).toEqual({
      maxToolTurns: 12,
      wallClockMs: 900_000,
      contextTokens: 16_000,
      maxOutputTokens: 4_000,
      maxBudgetUsd: 1.25,
      retryCount: 0,
      repositoryInspectionToolBudget: 5,
    });
  });

  it("honors allowedStages for non-qwen profiles", () => {
    const nonQwen = profile({
      runtimeId: "codex",
      providerId: "openai",
      options: { allowedStages: ["planner", "reviewer"] },
    });

    expect(isRuntimeProfileAllowedForStage(nonQwen, "planner")).toBe(true);
    expect(isRuntimeProfileAllowedForStage(nonQwen, "implementer")).toBe(false);
  });
});
