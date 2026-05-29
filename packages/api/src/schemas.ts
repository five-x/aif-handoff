import { z } from "zod";
import {
  MEMORY_ITEM_STATUSES,
  MEMORY_CLAIM_SOURCE_KINDS,
  MEMORY_CLAIM_STATUSES,
  MEMORY_FAILURE_FAMILIES,
  MEMORY_ITEM_TYPES,
  MEMORY_SCOPES,
  TASK_EVENTS,
  TASK_HIERARCHY_ROLES,
  TASK_PARENT_CLOSEOUT_POLICIES,
  TASK_INTENTS,
  TASK_STATUSES,
  REQUIREMENT_ANSWER_TYPES,
  REQUIREMENT_QUESTION_STAGES,
  ATTACHMENT_CONTENT_MAX_CHARS,
  ATTACHMENT_MAX_BYTES,
  getEnv,
  isAllowedAttachmentMimeType,
  isBinaryAttachmentMimeType,
  isSafeAttachmentFilename,
  isSafeAttachmentStoragePath,
  isValidBase64AttachmentContent,
} from "@aif/shared";

/**
 * ISO-8601 datetime accepted with any offset, but **normalized to UTC `Z`**
 * before storage. We compare `scheduledAt` as TEXT in the DB (`<=` against
 * `new Date().toISOString()`), and lexical string compare only matches
 * instant compare when both sides use the same UTC `Z` form. Without
 * normalization, `+03:00` values would silently never trigger.
 *
 * `null` is allowed to clear a previously-set schedule.
 * Past timestamps are rejected here so the scheduler is never asked to
 * fire something already overdue.
 */
export const scheduledAtSchema = z
  .string()
  .datetime({ offset: true, message: "scheduledAt must be ISO-8601" })
  .transform((s) => new Date(s).toISOString())
  .refine((iso) => Date.parse(iso) > Date.now(), {
    message: "scheduledAt must be a future timestamp",
  })
  .nullable()
  .optional();

const attachmentBaseObjectSchema = z.object({
  name: z.string().min(1).max(500),
  mimeType: z.string().min(1).max(200),
  size: z.number().int().min(0).max(ATTACHMENT_MAX_BYTES),
  content: z.string().max(ATTACHMENT_CONTENT_MAX_CHARS).nullable(),
  sourceKind: z.enum(["task", "comment", "chat"]).optional(),
  sourceRef: z.string().max(500).optional(),
  redactionStatus: z.enum(["none", "redacted", "not_scanned"]).optional(),
  /** Relative path in storage/ — present for file-backed attachments */
});

function validateAttachmentBase(
  attachment: z.infer<typeof attachmentBaseObjectSchema>,
  ctx: z.RefinementCtx,
): void {
  if (!isSafeAttachmentFilename(attachment.name)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["name"],
      message: "Unsafe attachment filename",
    });
  }
  if (!isAllowedAttachmentMimeType(attachment.mimeType)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["mimeType"],
      message: "Unsupported attachment MIME type",
    });
  }
  if (
    attachment.content &&
    isBinaryAttachmentMimeType(attachment.mimeType) &&
    !isValidBase64AttachmentContent(attachment.content)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["content"],
      message: "Binary attachment content must be valid base64",
    });
  }
}

const attachmentBaseSchema = attachmentBaseObjectSchema.superRefine(validateAttachmentBase);

const taskAttachmentSchema = attachmentBaseObjectSchema
  .extend({
    path: z.string().max(1000).optional(),
  })
  .superRefine((attachment, ctx) => {
    validateAttachmentBase(attachment, ctx);
    if (attachment.path && !isSafeAttachmentStoragePath(attachment.path)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["path"],
        message: "Unsafe attachment storage path",
      });
    }
  });

export const createProjectSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  rootPath: z.string().min(1, "Root path is required"),
  plannerMaxBudgetUsd: z.number().positive().optional(),
  planCheckerMaxBudgetUsd: z.number().positive().optional(),
  implementerMaxBudgetUsd: z.number().positive().optional(),
  reviewSidecarMaxBudgetUsd: z.number().positive().optional(),
  parallelEnabled: z.boolean().optional(),
  defaultTaskRuntimeProfileId: z.string().min(1).nullable().optional(),
  defaultPlanRuntimeProfileId: z.string().min(1).nullable().optional(),
  defaultReviewRuntimeProfileId: z.string().min(1).nullable().optional(),
  defaultChatRuntimeProfileId: z.string().min(1).nullable().optional(),
});

export const createTaskSchema = z.object({
  projectId: z.string().min(1, "Project ID is required"),
  title: z.string().min(1, "Title is required").max(500),
  description: z.string().default(""),
  sourceRef: z.string().max(500).nullable().optional(),
  attachments: z.array(taskAttachmentSchema).max(100).default([]),
  priority: z.number().int().min(0).max(5).default(0),
  autoMode: z.boolean().default(true),
  taskIntent: z.enum(TASK_INTENTS).optional(),
  isFix: z.boolean().default(false),
  plannerMode: z.enum(["fast", "full"]).optional(),
  planPath: z.string().max(500).optional(),
  planDocs: z.boolean().optional(),
  planTests: z.boolean().optional(),
  skipReview: z.boolean().optional(),
  useSubagents: z.boolean().optional(),
  maxReviewIterations: z
    .number()
    .int()
    .min(1)
    .max(10)
    .default(getEnv().AGENT_MAX_REVIEW_ITERATIONS),
  paused: z.boolean().default(false),
  runtimeProfileId: z.string().min(1).nullable().optional(),
  modelOverride: z.string().max(200).nullable().optional(),
  runtimeOptions: z.record(z.string(), z.unknown()).nullable().optional(),
  roadmapAlias: z.string().max(200).optional(),
  tags: z.array(z.string().max(100)).max(50).default([]),
  scheduledAt: scheduledAtSchema,
  parentTaskId: z.string().min(1).nullable().optional(),
  hierarchyRole: z.enum(TASK_HIERARCHY_ROLES).optional(),
  parentCloseoutPolicy: z.enum(TASK_PARENT_CLOSEOUT_POLICIES).nullable().optional(),
});

export const updateTaskSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().optional(),
  sourceRef: z.string().max(500).nullable().optional(),
  attachments: z.array(taskAttachmentSchema).max(100).optional(),
  priority: z.number().int().min(0).max(5).optional(),
  autoMode: z.boolean().optional(),
  taskIntent: z.enum(TASK_INTENTS).optional(),
  isFix: z.boolean().optional(),
  plannerMode: z.enum(["fast", "full"]).optional(),
  planPath: z.string().max(500).optional(),
  planDocs: z.boolean().optional(),
  planTests: z.boolean().optional(),
  skipReview: z.boolean().optional(),
  useSubagents: z.boolean().optional(),
  maxReviewIterations: z.number().int().min(1).max(10).optional(),
  plan: z.string().nullable().optional(),
  implementationLog: z.string().nullable().optional(),
  implementationManifest: z.record(z.string(), z.unknown()).nullable().optional(),
  reviewComments: z.string().nullable().optional(),
  agentActivityLog: z.string().nullable().optional(),
  blockedReason: z.string().nullable().optional(),
  blockedFromStatus: z.enum(TASK_STATUSES).nullable().optional(),
  retryAfter: z.string().nullable().optional(),
  retryCount: z.number().int().min(0).optional(),
  roadmapAlias: z.string().max(200).nullable().optional(),
  tags: z.array(z.string().max(100)).max(50).optional(),
  reworkRequested: z.boolean().optional(),
  paused: z.boolean().optional(),
  lastHeartbeatAt: z.string().nullable().optional(),
  runtimeProfileId: z.string().min(1).nullable().optional(),
  modelOverride: z.string().max(200).nullable().optional(),
  runtimeOptions: z.record(z.string(), z.unknown()).nullable().optional(),
  scheduledAt: scheduledAtSchema,
  parentTaskId: z.string().min(1).nullable().optional(),
  hierarchyRole: z.enum(TASK_HIERARCHY_ROLES).optional(),
  parentCloseoutPolicy: z.enum(TASK_PARENT_CLOSEOUT_POLICIES).nullable().optional(),
});

export const taskEventSchema = z.object({
  event: z.enum(TASK_EVENTS),
  deletePlanFile: z.boolean().optional(),
  commitOnApprove: z.boolean().optional(),
  manualExceptionJustification: z.string().min(1).max(20_000).optional(),
});

export const createRequirementQuestionSchema = z.object({
  stage: z.enum(REQUIREMENT_QUESTION_STAGES),
  targetResumeStage: z.enum(REQUIREMENT_QUESTION_STAGES).optional(),
  idempotencyKey: z.string().min(1).max(200).nullable().optional(),
  question: z.string().min(1).max(20_000),
  whyNeeded: z.string().min(1).max(20_000),
  blocking: z.boolean().default(true),
  answerType: z.enum(REQUIREMENT_ANSWER_TYPES).default("textarea"),
  options: z.array(z.string().min(1).max(1000)).max(50).nullable().optional(),
  defaultAnswer: z.string().max(20_000).nullable().optional(),
  placeholder: z.string().max(1000).nullable().optional(),
  sourceAgent: z.string().min(1).max(200).optional(),
  sourcePromptHash: z.string().max(200).nullable().optional(),
});

export const answerRequirementQuestionSchema = z.object({
  answer: z.string().min(1).max(50_000),
  attachments: z.array(taskAttachmentSchema).max(20).default([]),
});

export const answerRequirementQuestionBatchSchema = z.object({
  answers: z
    .array(
      answerRequirementQuestionSchema.extend({
        questionId: z.string().min(1),
      }),
    )
    .min(1)
    .max(50),
  autoResume: z.boolean().optional(),
});

export const manualExceptionSchema = z.object({
  justification: z.string().min(1).max(20_000),
});

export const worktreeCleanupSchema = z.object({
  action: z.enum(["archive", "delete"]).default("archive"),
});

export const operatorLimitQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  includeGlobal: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === "true")),
});

export const createTaskCommentSchema = z.object({
  message: z.string().min(1, "Comment message is required").max(20_000),
  attachments: z.array(taskAttachmentSchema).max(100).default([]),
});

export const reorderTaskSchema = z.object({
  position: z.number(),
});

export const broadcastTaskSchema = z.object({
  type: z
    .enum([
      "task:created",
      "task:updated",
      "task:moved",
      "task:activity",
      "task:scheduled_fired",
      "task:questions_created",
      "task:needs_input",
      "task:requirements_snapshot_created",
      "task:requirements_snapshot_updated",
      "task:timeline_updated",
      "task:evidence_recorded",
      "task:trust_updated",
      "task:manual_handoff_required",
    ])
    .default("task:updated"),
});

export const autoQueueModeSchema = z.object({
  enabled: z.boolean(),
});

export const broadcastProjectSchema = z.object({
  type: z.enum([
    "project:auto_queue_mode_changed",
    "project:auto_queue_advanced",
    "project:runtime_limit_updated",
    "project:memory_candidate_created",
    "project:usage_updated",
    "project:queue_updated",
    "project:worktree_warning",
  ]),
  taskId: z.string().min(1).optional(),
  runtimeProfileId: z.string().min(1).nullable().optional(),
});

export const roadmapImportSchema = z.object({
  roadmapAlias: z.string().min(1, "Roadmap alias is required").max(200),
  taskIntent: z.enum(TASK_INTENTS).optional(),
});

export const roadmapGenerateSchema = z.object({
  roadmapAlias: z.string().min(1, "Roadmap alias is required").max(200),
  taskIntent: z.enum(TASK_INTENTS).optional(),
  vision: z.string().max(10000).optional(),
});

export const taskSplitProposalRejectSchema = z.object({
  reason: z.string().max(1000).optional(),
});

export const warmupCreateSchema = z.object({
  ttlSeconds: z.number().int().min(60).max(86_400).default(3_600),
});

export const createChatSessionSchema = z.object({
  projectId: z.string().min(1, "Project ID is required"),
  title: z.string().max(200).optional(),
  runtimeProfileId: z.string().min(1).nullable().optional(),
  runtimeSessionId: z.string().min(1).nullable().optional(),
});

export const updateChatSessionSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  runtimeProfileId: z.string().min(1).nullable().optional(),
  runtimeSessionId: z.string().min(1).nullable().optional(),
});

export const updateAppRuntimeDefaultsSchema = z
  .object({
    defaultTaskRuntimeProfileId: z.string().min(1).nullable().optional(),
    defaultPlanRuntimeProfileId: z.string().min(1).nullable().optional(),
    defaultReviewRuntimeProfileId: z.string().min(1).nullable().optional(),
    defaultChatRuntimeProfileId: z.string().min(1).nullable().optional(),
  })
  .refine((payload) => Object.keys(payload).length > 0, {
    message: "At least one field is required",
  });

export const chatAttachmentSchema = attachmentBaseSchema;

export const chatRequestSchema = z.object({
  projectId: z.string().min(1, "Project ID is required"),
  message: z.string().min(1, "Message is required").max(50_000),
  clientId: z.string().min(1, "Client ID is required").optional(),
  conversationId: z.string().optional(),
  sessionId: z.string().optional(),
  explore: z.boolean().default(false),
  taskId: z.string().optional(),
  runtimeProfileId: z.string().min(1).nullable().optional(),
  attachments: z.array(chatAttachmentSchema).max(100).optional(),
});

const runtimeHeadersSchema = z.record(z.string(), z.string());
const runtimeOptionsSchema = z.record(z.string(), z.unknown());
const runtimeEnvVarSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(
    /^[A-Za-z0-9_.-]+$/,
    "apiKeyEnvVar must contain only letters, numbers, dot, underscore, or hyphen",
  )
  .nullable()
  .optional();

export const createRuntimeProfileSchema = z.object({
  projectId: z.string().min(1).nullable().optional(),
  name: z.string().min(1).max(200),
  runtimeId: z.string().min(1).max(100),
  providerId: z.string().min(1).max(100),
  transport: z.string().max(100).nullable().optional(),
  baseUrl: z.string().max(1000).nullable().optional(),
  apiKeyEnvVar: runtimeEnvVarSchema,
  defaultModel: z.string().max(200).nullable().optional(),
  headers: runtimeHeadersSchema.optional(),
  options: runtimeOptionsSchema.optional(),
  enabled: z.boolean().optional(),
});

export const updateRuntimeProfileSchema = createRuntimeProfileSchema
  .partial()
  .refine((payload) => Object.keys(payload).length > 0, {
    message: "At least one field is required",
  });

export const runtimeProfileValidationSchema = z.object({
  projectId: z.string().min(1).optional(),
  profileId: z.string().min(1).optional(),
  profile: createRuntimeProfileSchema.optional(),
  modelOverride: z.string().max(200).nullable().optional(),
  runtimeOptions: runtimeOptionsSchema.nullable().optional(),
  // Temporary credential for validation only. Never persisted.
  apiKey: z.string().min(1).optional(),
  forceRefresh: z.boolean().optional(),
});

export const runtimeProfileModelsSchema = z.object({
  projectId: z.string().min(1).optional(),
  profileId: z.string().min(1).optional(),
  profile: createRuntimeProfileSchema.optional(),
  modelOverride: z.string().max(200).nullable().optional(),
  runtimeOptions: runtimeOptionsSchema.nullable().optional(),
  apiKey: z.string().min(1).optional(),
  forceRefresh: z.boolean().optional(),
});

export const runtimeProfileListQuerySchema = z.object({
  projectId: z.string().min(1).optional(),
  includeGlobal: z.string().optional(),
  enabledOnly: z.string().optional(),
  scope: z.enum(["global", "project", "visible"]).optional(),
});

export const memoryListQuerySchema = z.object({
  projectId: z.string().min(1).optional(),
  status: z.enum(MEMORY_ITEM_STATUSES).optional(),
  scope: z.enum(MEMORY_SCOPES).optional(),
  includeGlobal: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === "true")),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

const memoryClaimSourceSchema = z.object({
  kind: z.enum(MEMORY_CLAIM_SOURCE_KINDS),
  ref: z.string().min(1).max(500).nullable().optional(),
  taskId: z.string().max(200).nullable().optional(),
  artifactId: z.string().max(200).nullable().optional(),
  evidenceId: z.string().max(200).nullable().optional(),
  memoryId: z.string().max(200).nullable().optional(),
  path: z.string().max(500).nullable().optional(),
  label: z.string().max(200).nullable().optional(),
  excerpt: z.string().max(1_000).nullable().optional(),
  observedAt: z.string().max(100).nullable().optional(),
});

const memoryClaimSchema = z.object({
  claimId: z.string().min(1).max(120),
  type: z.enum(MEMORY_ITEM_TYPES),
  status: z.enum(MEMORY_CLAIM_STATUSES).default("pending"),
  text: z.string().min(1).max(1_000),
  sources: z.array(memoryClaimSourceSchema).min(1).max(10),
  supersedes: z.array(z.string().max(120)).max(20).default([]),
  contradicts: z.array(z.string().max(120)).max(20).default([]),
  lastValidatedAt: z.string().max(100).nullable().optional().default(null),
});

export const createMemoryItemSchema = z
  .object({
    projectId: z.string().min(1).nullable().optional(),
    scope: z.enum(MEMORY_SCOPES),
    sourceTaskId: z.string().min(1).max(200).nullable().optional(),
    sourceKind: z.enum(["task", "manual"]).optional(),
    sourceRef: z.string().max(500).nullable().optional(),
    itemType: z.enum(MEMORY_ITEM_TYPES).optional(),
    failureFamily: z.enum(MEMORY_FAILURE_FAMILIES).nullable().optional(),
    title: z.string().min(1).max(500),
    summary: z.string().min(1).max(5_000),
    content: z.string().min(1).max(50_000),
    claims: z.array(memoryClaimSchema).max(20).optional(),
    tags: z.array(z.string().max(100)).max(50).optional(),
    expiresAt: z.string().datetime({ offset: true }).nullable().optional(),
  })
  .refine((payload) => payload.scope === "global" || Boolean(payload.projectId), {
    message: "projectId is required for project-scoped memory",
    path: ["projectId"],
  });

export const updateMemoryItemSchema = z
  .object({
    scope: z.enum(MEMORY_SCOPES).optional(),
    itemType: z.enum(MEMORY_ITEM_TYPES).optional(),
    failureFamily: z.enum(MEMORY_FAILURE_FAMILIES).nullable().optional(),
    title: z.string().min(1).max(500).optional(),
    summary: z.string().min(1).max(5_000).optional(),
    content: z.string().min(1).max(50_000).optional(),
    claims: z.array(memoryClaimSchema).max(20).optional(),
    tags: z.array(z.string().max(100)).max(50).optional(),
    reviewNote: z.string().max(5_000).nullable().optional(),
    expiresAt: z.string().datetime({ offset: true }).nullable().optional(),
  })
  .refine((payload) => Object.keys(payload).length > 0, {
    message: "At least one field is required",
  });

export const memoryActionSchema = z.object({
  note: z.string().max(5_000).nullable().optional(),
});
