import { isTaskIntent, type ChatAction, type TaskIntent } from "@aif/shared/browser";

const ACTION_REGEX = /<!--ACTION:([A-Z_]+)-->\s*(\{[\s\S]*?\})\s*<!--\/ACTION-->/g;

export interface ParsedMessage {
  /** Message text with action blocks removed */
  text: string;
  actions: ChatAction[];
}

function readString(value: unknown, maxLength: number): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim().slice(0, maxLength)
    : undefined;
}

function readIntent(parsed: Record<string, unknown>): TaskIntent {
  return isTaskIntent(parsed.taskIntent)
    ? parsed.taskIntent
    : parsed.isFix === true
      ? "fix"
      : "general";
}

function readTaskAction(
  parsed: Record<string, unknown>,
  type: "create_task" | "create_follow_up",
): ChatAction | null {
  const title = readString(parsed.title, 500);
  if (!title) return null;
  const description = readString(parsed.description, 10_000) ?? "";
  const taskIntent = readIntent(parsed);
  return {
    type,
    title,
    description,
    taskIntent,
    ...(taskIntent === "fix" || parsed.isFix === true ? { isFix: true } : {}),
    ...(readString(parsed.sourceRef, 500) ? { sourceRef: readString(parsed.sourceRef, 500) } : {}),
  };
}

function readNonMutatingAction(parsed: Record<string, unknown>, marker: string): ChatAction | null {
  const sourceRef = readString(parsed.sourceRef, 500);
  if (marker === "START_EXPLORE") {
    return {
      type: "start_explore",
      ...(readString(parsed.prompt, 10_000) ? { prompt: readString(parsed.prompt, 10_000) } : {}),
      ...(sourceRef ? { sourceRef } : {}),
    };
  }
  if (marker === "EXPLAIN_BLOCKER") {
    const summary = readString(parsed.summary, 10_000);
    if (!summary) return null;
    return {
      type: "explain_blocker",
      summary,
      ...(readString(parsed.title, 500) ? { title: readString(parsed.title, 500) } : {}),
      ...(sourceRef ? { sourceRef } : {}),
    };
  }
  if (marker === "PREPARE_REPLAN") {
    const proposal = readString(parsed.proposal, 20_000);
    if (!proposal) return null;
    return {
      type: "prepare_replan",
      proposal,
      ...(readString(parsed.title, 500) ? { title: readString(parsed.title, 500) } : {}),
      ...(readString(parsed.rationale, 10_000)
        ? { rationale: readString(parsed.rationale, 10_000) }
        : {}),
      ...(sourceRef ? { sourceRef } : {}),
    };
  }
  return null;
}

export function parseChatActions(content: string): ParsedMessage {
  const actions: ChatAction[] = [];
  const text = content.replace(ACTION_REGEX, (_match, marker: string, json: string) => {
    try {
      const parsed = JSON.parse(json) as Record<string, unknown>;
      const action =
        marker === "CREATE_TASK"
          ? readTaskAction(parsed, "create_task")
          : marker === "CREATE_FOLLOW_UP"
            ? readTaskAction(parsed, "create_follow_up")
            : readNonMutatingAction(parsed, marker);
      if (action) actions.push(action);
    } catch {
      // Malformed or unsupported action JSON - skip.
    }
    return "";
  });

  return { text: text.trim(), actions };
}
