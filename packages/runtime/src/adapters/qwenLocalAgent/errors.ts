/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import {
  RuntimeExecutionError,
  classifyByHttpStatus,
  classifyByMessageFallback,
} from "../../errors.js";
const CATEGORY_TO_ADAPTER_CODE = {
  rate_limit: "QWEN_LOCAL_AGENT_RATE_LIMIT",
  auth: "QWEN_LOCAL_AGENT_AUTH_ERROR",
  timeout: "QWEN_LOCAL_AGENT_TIMEOUT",
  permission: "QWEN_LOCAL_AGENT_PERMISSION_DENIED",
  stream: "QWEN_LOCAL_AGENT_STREAM_ERROR",
  transport: "QWEN_LOCAL_AGENT_TRANSPORT_ERROR",
  model_not_found: "QWEN_LOCAL_AGENT_MODEL_NOT_FOUND",
  context_length: "QWEN_LOCAL_AGENT_CONTEXT_LENGTH",
  content_filter: "QWEN_LOCAL_AGENT_CONTENT_FILTER",
  unknown: "QWEN_LOCAL_AGENT_RUNTIME_ERROR",
};
function messageFromUnknown(error) {
  return error instanceof Error ? error.message : String(error);
}
function classify(message, httpStatus) {
  if (httpStatus !== undefined) {
    const category = classifyByHttpStatus(httpStatus);
    if (category) {
      return { adapterCode: CATEGORY_TO_ADAPTER_CODE[category], category };
    }
  }
  const category = classifyByMessageFallback(message);
  return { adapterCode: CATEGORY_TO_ADAPTER_CODE[category], category };
}
function mergeMetadata(error, httpStatus, metadata = {}) {
  const baseMetadata =
    error instanceof RuntimeExecutionError
      ? {
          httpStatus: error.httpStatus,
          resetAt: error.resetAt,
          retryAfterMs: error.retryAfterMs,
          retryAfterSeconds: error.retryAfterSeconds,
          limitSnapshot: error.limitSnapshot,
          providerMeta: error.providerMeta,
        }
      : {};
  return {
    ...baseMetadata,
    ...metadata,
    httpStatus: httpStatus ?? metadata.httpStatus ?? baseMetadata.httpStatus,
  };
}
export class QwenLocalAgentRuntimeAdapterError extends RuntimeExecutionError {
  adapterCode;
  constructor(message, adapterCode, category, cause, metadata = {}) {
    super(message, cause, category, { ...metadata, adapterCode });
    this.name = "QwenLocalAgentRuntimeAdapterError";
    this.adapterCode = adapterCode;
  }
}
export function classifyQwenLocalAgentRuntimeError(error, httpStatus, metadata = {}) {
  if (error instanceof QwenLocalAgentRuntimeAdapterError) {
    return error;
  }
  const message = messageFromUnknown(error);
  const mergedMetadata = mergeMetadata(error, httpStatus, metadata);
  if (error instanceof RuntimeExecutionError) {
    return new QwenLocalAgentRuntimeAdapterError(
      message,
      CATEGORY_TO_ADAPTER_CODE[error.category],
      error.category,
      error,
      mergedMetadata,
    );
  }
  const { adapterCode, category } = classify(message, mergedMetadata.httpStatus);
  return new QwenLocalAgentRuntimeAdapterError(
    message,
    adapterCode,
    category,
    error,
    mergedMetadata,
  );
}
