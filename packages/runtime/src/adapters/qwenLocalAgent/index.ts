/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { RuntimeTransport, UsageReporting } from "../../types.js";
import type { RuntimeAdapter } from "../../types.js";
import { redactProviderTextForLogs } from "@aif/shared";
import { RuntimeExecutionError } from "../../errors.js";
import {
  assertQwenLocalAgentApiTransport,
  listQwenLocalAgentModels,
  runQwenLocalAgentApi,
  validateQwenLocalAgentApiConnection,
} from "./api.js";
import { classifyQwenLocalAgentRuntimeError } from "./errors.js";
export type QwenLocalAgentAdapterLogger = {
  debug?(context: Record<string, unknown>, message: string): void;
  info?(context: Record<string, unknown>, message: string): void;
  warn?(context: Record<string, unknown>, message: string): void;
  error?(context: Record<string, unknown>, message: string): void;
};
export interface CreateQwenLocalAgentRuntimeAdapterOptions {
  runtimeId?: string;
  providerId?: string;
  displayName?: string;
  logger?: QwenLocalAgentAdapterLogger;
}
const API_CAPABILITIES = {
  supportsResume: false,
  supportsSessionFork: false,
  supportsSessionList: false,
  supportsAgentDefinitions: false,
  supportsAifSkillCommands: false,
  supportsStreaming: false,
  supportsModelDiscovery: true,
  supportsApprovals: false,
  supportsCustomEndpoint: true,
  usageReporting: UsageReporting.PARTIAL,
  supportsInteractiveQuestions: false,
};
const DEFAULT_QWEN_MODELS = [
  {
    id: "Qwen3-32B-Q4_K_M.gguf",
    label: "Qwen3 32B Q4_K_M",
    supportsStreaming: false,
  },
];
function createFallbackLogger() {
  return {
    debug(context, message) {
      console.debug("[runtime:qwen-local-agent]", message, context);
    },
    info(context, message) {
      console.info("INFO [runtime:qwen-local-agent]", message, context);
    },
    warn(context, message) {
      console.warn("WARN [runtime:qwen-local-agent]", message, context);
    },
    error(context, message) {
      console.error("ERROR [runtime:qwen-local-agent]", message, context);
    },
  };
}
function diagnoseErrorMessage(input) {
  const message = input.error instanceof Error ? input.error.message : String(input.error);
  if (input.error instanceof RuntimeExecutionError && input.error.category !== "unknown") {
    switch (input.error.category) {
      case "auth":
        return "Qwen local agent API key is missing or rejected. Check QWEN_API_KEY only if the endpoint requires auth.";
      case "transport":
        return "Cannot reach the Qwen local endpoint. Check profile baseUrl or QWEN_BASE_URL.";
      case "timeout":
        return `Qwen local agent timed out. ${message}`;
      case "permission":
        return `Qwen local agent tool execution was denied. ${message}`;
      case "model_not_found":
        return "Qwen local agent model is missing. Check profile defaultModel or QWEN_MODEL.";
      default:
        return `Qwen local agent failed. ${message}`;
    }
  }
  return `Qwen local agent error: ${message}`;
}
export function createQwenLocalAgentRuntimeAdapter(
  options: CreateQwenLocalAgentRuntimeAdapterOptions = {},
): RuntimeAdapter {
  const runtimeId = options.runtimeId ?? "qwen-local-agent";
  const providerId = options.providerId ?? "qwen";
  const logger = options.logger ?? createFallbackLogger();
  return {
    descriptor: {
      id: runtimeId,
      providerId,
      displayName: options.displayName ?? "Qwen Local Agent",
      description: "AIF-controlled function-tool loop for local Qwen llama.cpp endpoints.",
      lightModel: null,
      defaultApiKeyEnvVar: "QWEN_API_KEY",
      defaultBaseUrlEnvVar: "QWEN_BASE_URL",
      defaultModelPlaceholder: "Qwen3-32B-Q4_K_M.gguf",
      supportedTransports: [RuntimeTransport.API],
      defaultTransport: RuntimeTransport.API,
      capabilities: API_CAPABILITIES,
    },
    async run(input) {
      try {
        return await runQwenLocalAgentApi(input, logger);
      } catch (error) {
        throw classifyQwenLocalAgentRuntimeError(error);
      }
    },
    async validateConnection(input) {
      return validateQwenLocalAgentApiConnection(input);
    },
    async listModels(input) {
      assertQwenLocalAgentApiTransport(input);
      try {
        const models = await listQwenLocalAgentModels(input);
        return models.length > 0 ? models : DEFAULT_QWEN_MODELS;
      } catch (error) {
        logger.warn?.(
          {
            runtimeId: input.runtimeId,
            profileId: input.profileId ?? null,
            error: redactProviderTextForLogs(
              error instanceof Error ? error.message : String(error),
            ),
          },
          "Qwen local agent model discovery failed, falling back to built-in list",
        );
        return DEFAULT_QWEN_MODELS;
      }
    },
    async diagnoseError(input) {
      return diagnoseErrorMessage(input);
    },
  };
}
