import type { RuntimeStage } from "@aif/shared";

export const AIF_RUNTIME_RECOVERY_OPTIONS_KEY = "__aifRuntimeRecovery";

export interface ContextFallbackRuntimeOption {
  stage: RuntimeStage;
  profileId: string;
  previousProfileId: string | null;
  reason: "context_length";
  attempt: number;
  createdAt: string;
}

export interface RuntimeRecoveryOptionsState {
  contextFallback?: ContextFallbackRuntimeOption;
  failedContextProfileIds?: Partial<Record<RuntimeStage, string[]>>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseRuntimeOptionsJson(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function unique(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value?.trim())))];
}

function readRecoveryState(options: Record<string, unknown>): RuntimeRecoveryOptionsState {
  const raw = options[AIF_RUNTIME_RECOVERY_OPTIONS_KEY];
  if (!isRecord(raw)) return {};

  const failedRaw = isRecord(raw.failedContextProfileIds) ? raw.failedContextProfileIds : {};
  const failedContextProfileIds: Partial<Record<RuntimeStage, string[]>> = {};
  for (const [stage, values] of Object.entries(failedRaw)) {
    if (!Array.isArray(values)) continue;
    failedContextProfileIds[stage as RuntimeStage] = unique(
      values.filter((value): value is string => typeof value === "string"),
    );
  }

  const fallbackRaw = isRecord(raw.contextFallback) ? raw.contextFallback : null;
  const contextFallback =
    typeof fallbackRaw?.stage === "string" &&
    typeof fallbackRaw.profileId === "string" &&
    fallbackRaw.profileId.trim().length > 0
      ? {
          stage: fallbackRaw.stage as RuntimeStage,
          profileId: fallbackRaw.profileId,
          previousProfileId:
            typeof fallbackRaw.previousProfileId === "string"
              ? fallbackRaw.previousProfileId
              : null,
          reason: "context_length" as const,
          attempt:
            typeof fallbackRaw.attempt === "number" && Number.isFinite(fallbackRaw.attempt)
              ? Math.max(1, Math.trunc(fallbackRaw.attempt))
              : 1,
          createdAt:
            typeof fallbackRaw.createdAt === "string"
              ? fallbackRaw.createdAt
              : new Date(0).toISOString(),
        }
      : undefined;

  return {
    ...(contextFallback ? { contextFallback } : {}),
    ...(Object.keys(failedContextProfileIds).length > 0 ? { failedContextProfileIds } : {}),
  };
}

function serializeRuntimeOptions(options: Record<string, unknown>): string | null {
  const entries = Object.entries(options).filter(([, value]) => value !== undefined);
  if (entries.length === 0) return null;
  return JSON.stringify(Object.fromEntries(entries));
}

function withRecoveryState(
  rawJson: string | null | undefined,
  mutate: (state: RuntimeRecoveryOptionsState) => RuntimeRecoveryOptionsState,
): string | null {
  const options = parseRuntimeOptionsJson(rawJson);
  const state = mutate(readRecoveryState(options));
  const hasState = Boolean(state.contextFallback) || Boolean(state.failedContextProfileIds);
  if (hasState) {
    options[AIF_RUNTIME_RECOVERY_OPTIONS_KEY] = state;
  } else {
    delete options[AIF_RUNTIME_RECOVERY_OPTIONS_KEY];
  }
  return serializeRuntimeOptions(options);
}

export function splitRuntimeRecoveryOptions(rawJson: string | null | undefined): {
  adapterOptions: Record<string, unknown> | null;
  recovery: RuntimeRecoveryOptionsState;
} {
  const options = parseRuntimeOptionsJson(rawJson);
  const recovery = readRecoveryState(options);
  delete options[AIF_RUNTIME_RECOVERY_OPTIONS_KEY];
  return {
    adapterOptions: Object.keys(options).length > 0 ? options : null,
    recovery,
  };
}

export function readContextFallbackRuntimeOption(
  rawJson: string | null | undefined,
  stage: RuntimeStage,
): ContextFallbackRuntimeOption | null {
  const { recovery } = splitRuntimeRecoveryOptions(rawJson);
  const fallback = recovery.contextFallback;
  return fallback?.stage === stage ? fallback : null;
}

export function readFailedContextProfileIds(
  rawJson: string | null | undefined,
  stage: RuntimeStage,
): string[] {
  const { recovery } = splitRuntimeRecoveryOptions(rawJson);
  return unique(recovery.failedContextProfileIds?.[stage] ?? []);
}

export function setContextFallbackRuntimeOption(
  rawJson: string | null | undefined,
  input: {
    stage: RuntimeStage;
    profileId: string;
    previousProfileId: string | null;
    failedProfileId: string | null;
    attempt: number;
    createdAt: string;
  },
): string | null {
  return withRecoveryState(rawJson, (state) => {
    const failedContextProfileIds = { ...(state.failedContextProfileIds ?? {}) };
    failedContextProfileIds[input.stage] = unique([
      ...(failedContextProfileIds[input.stage] ?? []),
      input.failedProfileId,
    ]);
    return {
      ...state,
      failedContextProfileIds,
      contextFallback: {
        stage: input.stage,
        profileId: input.profileId,
        previousProfileId: input.previousProfileId,
        reason: "context_length",
        attempt: input.attempt,
        createdAt: input.createdAt,
      },
    };
  });
}

export function markContextProfileFailed(
  rawJson: string | null | undefined,
  stage: RuntimeStage,
  profileId: string | null,
): string | null {
  if (!profileId) return rawJson ?? null;
  return withRecoveryState(rawJson, (state) => {
    const failedContextProfileIds = { ...(state.failedContextProfileIds ?? {}) };
    failedContextProfileIds[stage] = unique([...(failedContextProfileIds[stage] ?? []), profileId]);
    return { ...state, failedContextProfileIds };
  });
}

export function clearContextFallbackRuntimeOption(
  rawJson: string | null | undefined,
  stage: RuntimeStage,
): string | null {
  return withRecoveryState(rawJson, (state) => {
    const fallback = state.contextFallback;
    return {
      ...state,
      ...(fallback?.stage === stage ? { contextFallback: undefined } : {}),
    };
  });
}
