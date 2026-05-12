/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import {
  AUDIT_EVIDENCE_RUNTIME_EVENT_TYPE,
  buildAuditEvidencePayload,
  redactProviderText,
  redactProviderTextForLogs,
} from "@aif/shared";
import { RuntimeExecutionError } from "../../errors.js";
import { buildToolUseEvents } from "../../toolEvents.js";
import { classifyQwenLocalAgentRuntimeError } from "./errors.js";
import {
  QWEN_LOCAL_AGENT_TOOLS,
  createDefaultQwenToolContext,
  executeQwenLocalTool,
  qwenToolResultForModel,
  sanitizeQwenToolNameForLog,
  sanitizeToolArguments,
  summarizeQwenToolUse,
} from "./tools.js";
const DEFAULT_BASE_URL_ENV_VAR = "QWEN_BASE_URL";
const DEFAULT_API_KEY_ENV_VAR = "QWEN_API_KEY";
const DEFAULT_MODEL_ENV_VAR = "QWEN_MODEL";
const DEFAULT_MAX_TOOL_TURNS = 12;
const DEFAULT_REPEATED_TOOL_CALL_LIMIT = 6;
const REPEATED_TOOL_CALL_FINAL_SUPPRESSIONS = 2;
const NONCONSECUTIVE_LOOP_PRONE_TOOLS = new Set(["git_commit"]);
function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function readString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}
function readNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function safeProviderErrorMessage(rawText, fallbackMessage) {
  const trimmed = rawText.trim();
  return trimmed.length > 0 ? redactProviderText(trimmed) : fallbackMessage;
}
export function assertQwenLocalAgentApiTransport(input) {
  if (input.transport && input.transport !== "api") {
    throw new RuntimeExecutionError(
      `qwen-local-agent supports only api transport, got ${input.transport}`,
      undefined,
      "permission",
    );
  }
}
function resolveBaseUrl(input) {
  const options = asRecord(input.options);
  const baseUrl =
    ("baseUrl" in input ? readString(input.baseUrl) : null) ??
    readString(options.baseUrl) ??
    readString(process.env[DEFAULT_BASE_URL_ENV_VAR]);
  if (!baseUrl) {
    throw new RuntimeExecutionError(
      "qwen-local-agent requires profile baseUrl or QWEN_BASE_URL",
      undefined,
      "transport",
    );
  }
  return baseUrl.replace(/\/+$/, "");
}
function resolveApiKeyEnvVar(input) {
  const options = asRecord(input.options);
  return (
    ("apiKeyEnvVar" in input ? readString(input.apiKeyEnvVar) : null) ??
    readString(options.apiKeyEnvVar) ??
    DEFAULT_API_KEY_ENV_VAR
  );
}
function resolveApiKey(input) {
  const options = asRecord(input.options);
  const apiKeyEnvVar = resolveApiKeyEnvVar(input);
  return (
    ("apiKey" in input ? readString(input.apiKey) : null) ??
    readString(options.apiKey) ??
    readString(process.env[apiKeyEnvVar])
  );
}
function resolveModel(input) {
  const options = asRecord(input.options);
  const model =
    readString(input.model) ??
    readString(options.model) ??
    readString(process.env[DEFAULT_MODEL_ENV_VAR]);
  if (!model) {
    throw new RuntimeExecutionError(
      "qwen-local-agent requires a model from profile defaultModel, options.model, or QWEN_MODEL",
      undefined,
      "model_not_found",
    );
  }
  return model;
}
function buildHeaders(input) {
  const headers = new Headers({ "Content-Type": "application/json" });
  const apiKey = resolveApiKey(input);
  if (apiKey) {
    headers.set("Authorization", `Bearer ${apiKey}`);
  }
  const rawHeaders = {
    ...asRecord(asRecord(input.options).headers),
    ...("headers" in input ? asRecord(input.headers) : {}),
  };
  for (const [key, value] of Object.entries(rawHeaders)) {
    if (typeof value === "string") {
      headers.set(key, value);
    }
  }
  return headers;
}
function buildRunTimeoutSignal(input) {
  const runMs = input.execution?.runTimeoutMs;
  const externalAbort = input.execution?.abortController;
  const signals = [];
  if (typeof runMs === "number" && Number.isFinite(runMs) && runMs > 0) {
    signals.push(AbortSignal.timeout(Math.floor(runMs)));
  }
  if (externalAbort) {
    signals.push(externalAbort.signal);
  }
  if (signals.length === 0) return undefined;
  if (signals.length === 1) return signals[0];
  return AbortSignal.any(signals);
}
function isAbortTimeoutError(error) {
  return (
    error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError")
  );
}
function buildMessages(input) {
  const messages = [];
  const baseSystem =
    "You are qwen-local-agent, an AIF-controlled repository worker. Use only the provided tools. All paths are relative to the project root. Do not request, read, print, or summarize secrets. Finish with a concise result.";
  let systemContent = input.systemPrompt ? `${baseSystem}\n\n${input.systemPrompt}` : baseSystem;
  if (input.execution?.systemPromptAppend) {
    systemContent = `${systemContent}\n\n${input.execution.systemPromptAppend}`;
  }
  messages.push({ role: "system", content: systemContent });
  messages.push({ role: "user", content: input.prompt });
  return messages;
}
function normalizeUsage(usage) {
  if (!usage || typeof usage !== "object") return null;
  const parsed = usage;
  const inputTokens = parsed.prompt_tokens ?? parsed.inputTokens ?? 0;
  const outputTokens = parsed.completion_tokens ?? parsed.outputTokens ?? 0;
  const totalTokens = parsed.total_tokens ?? parsed.totalTokens ?? inputTokens + outputTokens;
  const costUsd =
    typeof parsed.cost === "number"
      ? parsed.cost
      : typeof parsed.costUsd === "number"
        ? parsed.costUsd
        : undefined;
  return { inputTokens, outputTokens, totalTokens, costUsd };
}
function addUsage(left, right) {
  if (!right) return left;
  if (!left) return right;
  return {
    inputTokens: left.inputTokens + right.inputTokens,
    outputTokens: left.outputTokens + right.outputTokens,
    totalTokens: left.totalTokens + right.totalTokens,
    costUsd:
      left.costUsd != null || right.costUsd != null
        ? (left.costUsd ?? 0) + (right.costUsd ?? 0)
        : undefined,
  };
}
export function buildQwenLocalAgentRequestBody(input, messages = buildMessages(input)) {
  const options = asRecord(input.options);
  const body = {
    model: resolveModel(input),
    messages,
    tools: QWEN_LOCAL_AGENT_TOOLS,
    tool_choice: "auto",
    stream: false,
  };
  const temperature = readNumber(options.temperature);
  const maxTokens = readNumber(options.maxTokens);
  const topP = readNumber(options.topP);
  if (temperature != null) body.temperature = temperature;
  if (maxTokens != null) body.max_tokens = maxTokens;
  if (topP != null) body.top_p = topP;
  return body;
}
function readMaxToolTurns(input) {
  const options = asRecord(input.options);
  const raw =
    typeof input.execution?.maxTurns === "number"
      ? input.execution.maxTurns
      : typeof options.maxToolTurns === "number"
        ? options.maxToolTurns
        : DEFAULT_MAX_TOOL_TURNS;
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_MAX_TOOL_TURNS;
  return Math.max(1, Math.min(Math.floor(raw), 40));
}
function readRepeatedToolCallLimit(input) {
  const options = asRecord(input.options);
  const raw =
    typeof options.repeatedToolCallLimit === "number"
      ? options.repeatedToolCallLimit
      : DEFAULT_REPEATED_TOOL_CALL_LIMIT;
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_REPEATED_TOOL_CALL_LIMIT;
  return Math.max(2, Math.min(Math.floor(raw), 12));
}
function parseToolArguments(raw) {
  if (raw == null) return {};
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return {};
    const parsed = JSON.parse(trimmed);
    return asRecord(parsed);
  }
  return asRecord(raw);
}
function normalizeToolCalls(value) {
  if (!Array.isArray(value)) return [];
  const calls = [];
  for (const item of value) {
    const record = asRecord(item);
    const fn = asRecord(record.function);
    const name = readString(fn.name);
    if (!name) continue;
    const rawArgs = fn.arguments;
    calls.push({
      id: readString(record.id) ?? `tool-${calls.length + 1}`,
      type: "function",
      function: {
        name,
        arguments: typeof rawArgs === "string" ? rawArgs : JSON.stringify(rawArgs ?? {}),
      },
    });
  }
  return calls;
}
function stableToolValue(value) {
  if (Array.isArray(value)) return value.map((item) => stableToolValue(item));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, stableToolValue(child)]),
  );
}
function buildToolCallSignature(toolName, args) {
  return JSON.stringify({ toolName, args: stableToolValue(args) });
}
function emitEvent(input, events, event) {
  events.push(event);
  input.execution?.onEvent?.(event);
}
function emitToolUse(input, events, toolCall, args) {
  const timestamp = new Date().toISOString();
  const safeToolName = sanitizeQwenToolNameForLog(toolCall.function.name);
  const sanitizedArgs = sanitizeToolArguments(toolCall.function.name, args);
  const detail = summarizeQwenToolUse(safeToolName, sanitizedArgs);
  for (const event of buildToolUseEvents({
    toolName: safeToolName,
    toolUseId: redactProviderText(toolCall.id),
    input: sanitizedArgs,
    timestamp,
    detailSuffix: detail,
  })) {
    emitEvent(input, events, event);
  }
  input.execution?.onToolUse?.(safeToolName, detail);
}
function emitToolResult(input, events, toolCall, result) {
  const safeToolName = sanitizeQwenToolNameForLog(toolCall.function.name);
  emitEvent(input, events, {
    type: "tool:result",
    timestamp: new Date().toISOString(),
    level: result.ok ? "info" : "warn",
    message: `${safeToolName} ${result.ok ? "ok" : "failed"}`,
    data: {
      name: safeToolName,
      id: redactProviderText(toolCall.id),
      ok: result.ok,
      exitCode: result.exitCode ?? null,
      touchedFiles: result.touchedFiles.map((file) => redactProviderText(file)),
      ...(result.error ? { error: redactProviderText(result.error) } : {}),
    },
  });
}
function emitAuditEvidenceResult(input, events, toolCall, args, result) {
  const toolName = sanitizeQwenToolNameForLog(toolCall.function.name);
  let evidenceKind = null;
  let evidenceGrade = undefined;
  let paths = [];
  let command = null;
  if (toolName === "read_file") {
    evidenceKind = "file_read";
    evidenceGrade = "substantive";
    if (typeof args.path === "string") paths = [args.path];
  } else if (toolName === "list_files") {
    evidenceKind = "search";
    evidenceGrade = "discovery";
    if (typeof args.path === "string") paths = [args.path];
  } else if (toolName === "run_shell") {
    evidenceKind = "shell_command";
    command = {
      command: typeof args.command === "string" ? args.command : "",
      args: Array.isArray(args.args) ? args.args.filter((entry) => typeof entry === "string") : [],
      cwd: typeof args.cwd === "string" ? args.cwd : null,
    };
    if (typeof args.cwd === "string") paths = [args.cwd];
  } else if (toolName === "git_status") {
    evidenceKind = "shell_command";
    evidenceGrade = "discovery";
    command = { command: "git status", args: ["--short", "--branch"], cwd: null };
  }
  if (!evidenceKind) return;
  const output = [result.output, result.error ? `error:\n${result.error}` : ""]
    .filter(Boolean)
    .join("\n");
  emitEvent(input, events, {
    type: AUDIT_EVIDENCE_RUNTIME_EVENT_TYPE,
    timestamp: new Date().toISOString(),
    level: result.ok ? "info" : "warn",
    message: `${toolName} audit evidence captured`,
    data: {
      auditEvidence: buildAuditEvidencePayload({
        toolName,
        evidenceKind,
        evidenceGrade,
        paths,
        command,
        exitCode: result.exitCode ?? null,
        output,
      }),
    },
  });
}
function repeatedToolCallResult(toolName, repeatedCount, repeatedToolCallLimit) {
  const safeToolName = sanitizeQwenToolNameForLog(toolName);
  return {
    ok: false,
    output: "",
    error: [
      `Repeated identical ${safeToolName} call suppressed after ${repeatedCount} consecutive attempts.`,
      "Do not call the same tool with the same arguments again.",
      "Use a different verification step, commit required artifacts, or finish with the final result.",
      `repeatLimit=${repeatedToolCallLimit}`,
    ].join(" "),
    exitCode: null,
    touchedFiles: [],
  };
}
async function postChatCompletions(input, messages, signal) {
  const baseUrl = resolveBaseUrl(input);
  return fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: buildHeaders(input),
    body: JSON.stringify(buildQwenLocalAgentRequestBody(input, messages)),
    ...(signal ? { signal } : {}),
  });
}
export async function runQwenLocalAgentApi(input, logger) {
  assertQwenLocalAgentApiTransport(input);
  const signal = buildRunTimeoutSignal(input);
  const messages = buildMessages(input);
  const events = [];
  const maxTurns = readMaxToolTurns(input);
  const repeatedToolCallLimit = readRepeatedToolCallLimit(input);
  const toolContext = createDefaultQwenToolContext({
    projectRoot: input.projectRoot,
    cwd: input.cwd,
    signal,
    options: asRecord(input.options),
    environment: input.execution?.environment,
  });
  let usage = null;
  let sessionId = null;
  let raw = null;
  let lastToolCallSignature = null;
  let repeatedToolCallCount = 0;
  let repeatedToolCallSuppressions = 0;
  const toolCallSignatureCounts = new Map();
  logger?.info?.(
    {
      runtimeId: input.runtimeId,
      profileId: input.profileId ?? null,
      model: input.model ?? null,
      maxTurns,
    },
    "Starting qwen-local-agent run",
  );
  try {
    for (let turn = 0; turn < maxTurns; turn += 1) {
      const response = await postChatCompletions(input, messages, signal);
      const rawText = await response.text();
      if (!response.ok) {
        throw classifyQwenLocalAgentRuntimeError(
          new Error(safeProviderErrorMessage(rawText, "Qwen local agent request failed")),
          response.status,
        );
      }
      const payload = rawText.trim().length > 0 ? JSON.parse(rawText) : {};
      raw = payload;
      sessionId = readString(asRecord(payload).id) ?? sessionId;
      usage = addUsage(usage, normalizeUsage(asRecord(payload).usage));
      const rawChoices = asRecord(payload).choices;
      const choices = Array.isArray(rawChoices) ? rawChoices : [];
      const choice = asRecord(choices[0]);
      const message = asRecord(choice.message);
      const content = typeof message.content === "string" ? message.content : "";
      const toolCalls = normalizeToolCalls(message.tool_calls);
      if (toolCalls.length === 0) {
        logger?.debug?.(
          {
            runtimeId: input.runtimeId,
            turn,
            outputLength: content.length,
            eventCount: events.length,
          },
          "qwen-local-agent run completed",
        );
        return {
          outputText: content,
          sessionId,
          usage,
          events,
          raw,
        };
      }
      messages.push({
        role: "assistant",
        content: content || null,
        tool_calls: toolCalls,
      });
      for (const toolCall of toolCalls) {
        let args;
        try {
          args = parseToolArguments(toolCall.function.arguments);
        } catch (error) {
          args = {};
          const parseResult = {
            ok: false,
            output: "",
            error: redactProviderText(error instanceof Error ? error.message : String(error)),
            exitCode: null,
            touchedFiles: [],
          };
          emitToolUse(input, events, toolCall, args);
          emitToolResult(input, events, toolCall, parseResult);
          emitAuditEvidenceResult(input, events, toolCall, args, parseResult);
          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            name: toolCall.function.name,
            content: JSON.stringify(parseResult),
          });
          continue;
        }
        emitToolUse(input, events, toolCall, args);
        const signature = buildToolCallSignature(toolCall.function.name, args);
        const signatureCount = (toolCallSignatureCounts.get(signature) ?? 0) + 1;
        toolCallSignatureCounts.set(signature, signatureCount);
        if (signature === lastToolCallSignature) {
          repeatedToolCallCount += 1;
        } else {
          lastToolCallSignature = signature;
          repeatedToolCallCount = 1;
          repeatedToolCallSuppressions = 0;
        }
        const repeatedNonconsecutiveLoop =
          NONCONSECUTIVE_LOOP_PRONE_TOOLS.has(toolCall.function.name) &&
          signatureCount > repeatedToolCallLimit;
        const shouldSuppressRepeatedCall =
          repeatedToolCallCount > repeatedToolCallLimit || repeatedNonconsecutiveLoop;
        const result = shouldSuppressRepeatedCall
          ? repeatedToolCallResult(
              toolCall.function.name,
              Math.max(repeatedToolCallCount, signatureCount),
              repeatedToolCallLimit,
            )
          : await executeQwenLocalTool(toolCall.function.name, args, toolContext);
        if (shouldSuppressRepeatedCall) {
          repeatedToolCallSuppressions += repeatedNonconsecutiveLoop
            ? REPEATED_TOOL_CALL_FINAL_SUPPRESSIONS
            : 1;
        }
        emitToolResult(input, events, toolCall, result);
        emitAuditEvidenceResult(input, events, toolCall, args, result);
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          name: toolCall.function.name,
          content: qwenToolResultForModel(result),
        });
        if (repeatedToolCallSuppressions >= REPEATED_TOOL_CALL_FINAL_SUPPRESSIONS) {
          const safeToolName = sanitizeQwenToolNameForLog(toolCall.function.name);
          logger?.warn?.(
            {
              runtimeId: input.runtimeId,
              profileId: input.profileId ?? null,
              repeatedToolName: safeToolName,
              repeatedToolCallCount,
              repeatedToolCallLimit,
            },
            "Stopped qwen-local-agent after repeated identical tool calls",
          );
          return {
            outputText:
              `Stopped after a repeated ${safeToolName} tool-call loop. ` +
              "Partial repository changes may exist; coordinator evidence checks must decide whether rework is required.",
            sessionId,
            usage,
            events,
            raw,
          };
        }
      }
    }
    throw new RuntimeExecutionError(
      `qwen-local-agent exceeded max tool turns (${maxTurns})`,
      undefined,
      "timeout",
    );
  } catch (error) {
    if (isAbortTimeoutError(error)) {
      throw classifyQwenLocalAgentRuntimeError(
        new RuntimeExecutionError(
          `Run timeout: qwen-local-agent exceeded ${input.execution?.runTimeoutMs}ms limit`,
          error,
          "timeout",
        ),
      );
    }
    throw classifyQwenLocalAgentRuntimeError(error);
  }
}
export async function validateQwenLocalAgentApiConnection(input) {
  try {
    assertQwenLocalAgentApiTransport(input);
    const baseUrl = resolveBaseUrl(input);
    const response = await fetch(`${baseUrl}/models`, {
      method: "GET",
      headers: buildHeaders(input),
    });
    if (!response.ok) {
      return {
        ok: false,
        message: `Qwen local agent health check failed with status ${response.status}`,
      };
    }
    return { ok: true, message: "Qwen local agent API connection validated" };
  } catch (error) {
    if (error instanceof RuntimeExecutionError) {
      return { ok: false, message: error.message };
    }
    throw classifyQwenLocalAgentRuntimeError(error);
  }
}
export async function listQwenLocalAgentModels(input) {
  assertQwenLocalAgentApiTransport(input);
  const baseUrl = resolveBaseUrl(input);
  try {
    const response = await fetch(`${baseUrl}/models`, {
      method: "GET",
      headers: buildHeaders(input),
    });
    if (!response.ok) {
      const rawText = await response.text();
      throw classifyQwenLocalAgentRuntimeError(
        new Error(safeProviderErrorMessage(rawText, "Qwen local agent model listing failed")),
        response.status,
      );
    }
    const payload = await response.json();
    return (payload.data ?? []).map((model) => ({
      id: model.id,
      label: model.name ?? model.id,
      supportsStreaming: false,
      metadata: { owned_by: model.owned_by },
    }));
  } catch (error) {
    loggerDebugParseFailure(input, error);
    throw classifyQwenLocalAgentRuntimeError(error);
  }
}
function loggerDebugParseFailure(input, error) {
  void input;
  if (error instanceof SyntaxError) {
    console.debug(
      "[runtime:qwen-local-agent] Failed to parse model listing",
      redactProviderTextForLogs(error.message),
    );
  }
}
