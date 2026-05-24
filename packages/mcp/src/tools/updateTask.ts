import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  formatTaskIntentOptionsForPrompt,
  isTaskIntent,
  logger,
  normalizeTaskIntent,
  TASK_HIERARCHY_ROLES,
  TASK_PARENT_CLOSEOUT_POLICIES,
  TASK_INTENTS,
  type TaskIntent,
  type TaskHierarchyRole,
  type TaskParentCloseoutPolicy,
} from "@aif/shared";
import { findTaskById, updateTask, toTaskResponse } from "@aif/data";
import { registerMcpTool, type ToolContext } from "./index.js";
import { rateLimitError, toMcpError, validationError } from "../middleware/errorHandler.js";
import { compactTaskResponse } from "../utils/compactResponse.js";
import { broadcastTaskChange } from "../utils/broadcast.js";
import {
  assertRuntimeProfileSelection,
  buildEffectiveTaskRuntimeMetadata,
} from "./runtimeTaskMetadata.js";
import {
  assertPlanningCompatiblePlanMutation,
  validateSafeRelativeArtifactPath,
} from "./workflowGuards.js";

const log = logger("mcp:tool:update-task");
const updateTaskInputSchema: Record<string, z.ZodTypeAny> = {
  taskId: z.string().uuid().describe("Task ID to update (must exist)"),
  title: z.string().max(500).optional().describe("Updated task title"),
  description: z.string().optional().describe("Updated task description"),
  priority: z
    .number()
    .int()
    .min(0)
    .max(3)
    .optional()
    .describe("Priority level (0=none, 1=low, 2=medium, 3=high)"),
  tags: z.array(z.string()).optional().describe("Updated tags"),
  plan: z.string().nullable().optional().describe("Plan content (null to clear)"),
  autoMode: z.boolean().optional().describe("Enable/disable auto mode"),
  taskIntent: z
    .enum(TASK_INTENTS)
    .optional()
    .describe(`Typed task intent. Shared policy options:\n${formatTaskIntentOptionsForPrompt()}`),
  planPath: z
    .string()
    .optional()
    .describe("Plan file path (must be a safe relative artifact path)"),
  sourceRef: z
    .string()
    .max(500)
    .nullable()
    .optional()
    .describe("Optional source reference for the originating artifact or request"),
  isFix: z.boolean().optional().describe("Mark/unmark as fix"),
  plannerMode: z.enum(["fast", "full"]).optional().describe("Planner mode"),
  planDocs: z.boolean().optional().describe("Include documentation in plan"),
  planTests: z.boolean().optional().describe("Include tests in plan"),
  skipReview: z.boolean().optional().describe("Skip review stage"),
  useSubagents: z.boolean().optional().describe("Use subagents for implementation"),
  maxReviewIterations: z.number().int().min(1).optional().describe("Maximum review iterations"),
  paused: z.boolean().optional().describe("Pause/unpause task"),
  implementationLog: z.string().nullable().optional().describe("Implementation log content"),
  reviewComments: z.string().nullable().optional().describe("Review comments content"),
  roadmapAlias: z.string().nullable().optional().describe("Roadmap milestone alias"),
  blockedReason: z.string().nullable().optional().describe("Reason the task is blocked"),
  runtimeProfileId: z
    .string()
    .uuid()
    .nullable()
    .optional()
    .describe("Optional runtime profile override (must be project-scoped or global)"),
  modelOverride: z
    .string()
    .max(200)
    .nullable()
    .optional()
    .describe("Optional model override for task execution"),
  runtimeOptions: z
    .record(z.string(), z.unknown())
    .nullable()
    .optional()
    .describe("Optional runtime-specific options for task execution"),
  parentTaskId: z
    .string()
    .uuid()
    .nullable()
    .optional()
    .describe("Optional parent task ID for hierarchy attachment"),
  hierarchyRole: z.enum(TASK_HIERARCHY_ROLES).optional().describe("Hierarchy role for this task"),
  parentCloseoutPolicy: z
    .enum(TASK_PARENT_CLOSEOUT_POLICIES)
    .nullable()
    .optional()
    .describe("Closeout policy for container tasks"),
};

type UpdateTaskArgs = {
  autoMode?: boolean;
  blockedReason?: string | null;
  description?: string;
  implementationLog?: string | null;
  isFix?: boolean;
  taskIntent?: TaskIntent;
  maxReviewIterations?: number;
  modelOverride?: string | null;
  paused?: boolean;
  plan?: string | null;
  planDocs?: boolean;
  plannerMode?: "fast" | "full";
  planPath?: string;
  planTests?: boolean;
  priority?: number;
  reviewComments?: string | null;
  roadmapAlias?: string | null;
  runtimeOptions?: Record<string, unknown> | null;
  runtimeProfileId?: string | null;
  sourceRef?: string | null;
  skipReview?: boolean;
  tags?: string[];
  parentTaskId?: string | null;
  hierarchyRole?: TaskHierarchyRole;
  parentCloseoutPolicy?: TaskParentCloseoutPolicy | null;
  taskId: string;
  title?: string;
  useSubagents?: boolean;
};

const GUARDED_DIRECT_FIELDS = ["implementationLog", "reviewComments", "blockedReason"] as const;

export function register(server: McpServer, context: ToolContext): void {
  registerMcpTool(
    server,
    "handoff_update_task",
    "Update an existing task's fields (title, description, status, plan, etc.)",
    updateTaskInputSchema,
    async (rawArgs) => {
      const args = rawArgs as UpdateTaskArgs;
      try {
        if (!context.rateLimiter.check("handoff_update_task", "write")) {
          throw rateLimitError("handoff_update_task");
        }

        log.debug(
          {
            taskId: args.taskId,
            runtimeProfileId: args.runtimeProfileId ?? null,
            modelOverride: args.modelOverride ?? null,
            hasRuntimeOptions: args.runtimeOptions !== undefined,
          },
          "DEBUG [mcp:tool:*] handoff_update_task called with runtime metadata",
        );

        // Validate task exists
        const existing = findTaskById(args.taskId);
        if (!existing) {
          log.error({ taskId: args.taskId }, "Task not found for update");
          throw validationError(`Task not found: ${args.taskId}`, {
            taskId: ["Task does not exist"],
          });
        }

        assertRuntimeProfileSelection({
          toolName: "handoff_update_task",
          projectId: existing.projectId,
          runtimeProfileId: args.runtimeProfileId,
          log,
        });

        const guardedFields = GUARDED_DIRECT_FIELDS.filter((field) => args[field] !== undefined);
        if (guardedFields.length > 0) {
          throw validationError("Direct writes to guarded workflow fields are not allowed", {
            fields: guardedFields,
          });
        }

        validateSafeRelativeArtifactPath(args.planPath);
        if (args.plan !== undefined) {
          assertPlanningCompatiblePlanMutation(existing.status);
        }
        if (args.taskIntent !== undefined && !isTaskIntent(args.taskIntent)) {
          throw validationError("Invalid taskIntent", {
            taskIntent: [`Expected one of: ${TASK_INTENTS.join(", ")}`],
          });
        }

        // Extract taskId, pass remaining fields to updateTask
        const { taskId, ...fields } = args;
        if (fields.taskIntent !== undefined) {
          fields.taskIntent = normalizeTaskIntent(fields.taskIntent);
        } else if (fields.isFix === true) {
          fields.taskIntent = "fix";
        }

        // Build a summary of changed fields for logging
        const changedFields = Object.keys(fields).filter(
          (key) => fields[key as keyof typeof fields] !== undefined,
        );

        const row = updateTask(taskId, fields);

        if (!row) {
          log.error({ taskId }, "Task update returned undefined");
          throw validationError(`Task not found after update: ${taskId}`, {
            taskId: ["Task disappeared during update"],
          });
        }

        const full = toTaskResponse(row);
        const effectiveRuntime = buildEffectiveTaskRuntimeMetadata(full.id, full.projectId);
        const compact = compactTaskResponse({ ...full, effectiveRuntime });

        log.debug(
          {
            taskId,
            effectiveRuntimeSource: effectiveRuntime.source,
            effectiveRuntimeProfileId: effectiveRuntime.profileId,
          },
          "DEBUG [mcp:tool:*] Returning compact task response with effective runtime metadata",
        );

        log.info(
          {
            taskId,
            changedFields,
            runtimeProfileId: args.runtimeProfileId ?? null,
            modelOverride: args.modelOverride ?? null,
          },
          "handoff_update_task completed",
        );

        void broadcastTaskChange(taskId);

        return {
          content: [{ type: "text" as const, text: JSON.stringify(compact) }],
        };
      } catch (error) {
        throw toMcpError(error);
      }
    },
  );
}
