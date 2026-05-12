import {
  formatMemoryContextForPrompt,
  recordMemoryUsageEvents,
  retrieveApprovedMemoryForPrompt,
} from "@aif/data";
import { logger, type MemoryWorkflowKind } from "@aif/shared";

const log = logger("memory-context");

interface MemoryTaskContext {
  id: string;
  projectId: string;
  title: string;
  description: string;
  plan?: string | null;
  implementationLog?: string | null;
  reviewComments?: string | null;
}

export function buildTaskMemoryContext(input: {
  task: MemoryTaskContext;
  workflowKind: MemoryWorkflowKind;
  source: string;
  queryParts?: Array<string | null | undefined>;
  limit?: number;
}): string {
  try {
    const query = [
      input.task.title,
      input.task.description,
      input.task.plan,
      input.task.implementationLog,
      input.task.reviewComments,
      ...(input.queryParts ?? []),
    ]
      .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
      .join("\n\n");

    const items = retrieveApprovedMemoryForPrompt({
      projectId: input.task.projectId,
      query,
      limit: input.limit,
    });
    if (items.length === 0) return "";

    try {
      recordMemoryUsageEvents({
        items,
        projectId: input.task.projectId,
        taskId: input.task.id,
        workflowKind: input.workflowKind,
        source: input.source,
      });
    } catch (usageError) {
      log.warn(
        { taskId: input.task.id, workflowKind: input.workflowKind, usageError },
        "Failed to record memory usage events",
      );
    }

    return formatMemoryContextForPrompt(items);
  } catch (err) {
    log.warn(
      { taskId: input.task.id, workflowKind: input.workflowKind, err },
      "Failed to build task memory context",
    );
    return "";
  }
}
