import { execFileSync } from "node:child_process";
import {
  coerceOperatorCompletionEvidence,
  evaluateTaskCompletionEvidence,
  formatTaskCompletionBlockedReason,
  getEnv,
  hashAifPlanManifest,
  inferTaskIntent,
  isManualReviewBlockedTask,
  isDevelopmentImplementationIntent,
  normalizeOperatorCompletionPath,
  readAifPlanManifestSnapshot,
  resolveAuditPlanId,
  validateImplementationManifest,
  type OperatorCompletionEvidence,
} from "@aif/shared";
import {
  appendTaskActivityLog,
  findProjectById,
  findRoadmapBatchArtifactByTaskId,
  findTaskById,
  listAuditEvidenceEvents,
  recordTaskStageArtifactAttempt,
  setTaskFields,
  updateRoadmapBatchArtifactState,
  type TaskRow,
} from "@aif/data";

export interface OperatorVerifiedCompletionInput {
  taskId: string;
  commitSha: string;
  changedFiles: string[];
  verification: Array<{
    command: string;
    status: "passed";
    outputPreview: string;
    outputSha256: string;
  }>;
  worktreeClean: boolean;
  operatorNote?: string | null;
  allowBlockerOverride?: boolean;
  blockerOverrideJustification?: string | null;
}

interface OperatorGitValidationEvidence {
  trustedCommittedFiles: string[];
  dirtyUnrelatedFiles: string[];
}

export type OperatorVerifiedCompletionResult =
  | { ok: true; task: TaskRow; evidence: OperatorCompletionEvidence; nextStatus: TaskRow["status"] }
  | { ok: false; status: number; error: string };

function runGit(projectRoot: string, args: string[]): string | null {
  try {
    return execFileSync("git", args, {
      cwd: projectRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

function splitGitFiles(output: string | null): string[] {
  if (!output) return [];
  return output.split(/\r?\n/).map(normalizeOperatorCompletionPath).filter(Boolean);
}

function parseStatusFiles(output: string | null): string[] {
  if (!output) return [];
  return output
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => {
      const path = line.slice(2).trimStart();
      const renameIndex = path.indexOf(" -> ");
      return normalizeOperatorCompletionPath(renameIndex >= 0 ? path.slice(renameIndex + 4) : path);
    })
    .filter(Boolean);
}

function normalizeSet(paths: string[]): Set<string> {
  return new Set(paths.map((path) => normalizeOperatorCompletionPath(path).toLowerCase()));
}

function pathMatchesRelevantBoundary(path: string, boundary: string): boolean {
  const normalizedPath = normalizeOperatorCompletionPath(path).toLowerCase();
  const normalizedBoundary = normalizeOperatorCompletionPath(boundary).toLowerCase();
  if (!normalizedBoundary) return false;
  if (normalizedBoundary.includes("*")) {
    let pattern = "^";
    for (let index = 0; index < normalizedBoundary.length; index += 1) {
      const char = normalizedBoundary[index];
      const next = normalizedBoundary[index + 1];
      if (char === "*" && next === "*") {
        pattern += ".*";
        index += 1;
        continue;
      }
      if (char === "*") {
        pattern += "[^/]*";
        continue;
      }
      pattern += char.replace(/[\\^$+?.()|[\]{}]/g, "\\$&");
    }
    return new RegExp(`${pattern}$`).test(normalizedPath);
  }
  return (
    normalizedPath === normalizedBoundary || normalizedPath.startsWith(`${normalizedBoundary}/`)
  );
}

function collectSubmittedCommitFiles(projectRoot: string, commitSha: string): string[] {
  const commitFiles = splitGitFiles(
    runGit(projectRoot, ["diff-tree", "--root", "--no-commit-id", "--name-only", "-r", commitSha]),
  );
  return [...new Set(commitFiles)].sort((a, b) => a.localeCompare(b));
}

function validateGitEvidence(input: {
  projectRoot: string;
  evidence: OperatorCompletionEvidence;
  approvedDirtyFileBoundaries?: string[];
}): { ok: true; evidence: OperatorGitValidationEvidence } | { ok: false; error: string } {
  const commit = runGit(input.projectRoot, [
    "rev-parse",
    "--verify",
    `${input.evidence.commitSha}^{commit}`,
  ]);
  if (!commit)
    return { ok: false, error: "operator_verified_completion rejected: reason=commit_not_found" };

  const trustedCommittedFiles = collectSubmittedCommitFiles(
    input.projectRoot,
    input.evidence.commitSha,
  );
  if (trustedCommittedFiles.length === 0) {
    return {
      ok: false,
      error: "operator_verified_completion rejected: reason=commit_has_no_changed_files",
    };
  }
  const trustedSet = normalizeSet(trustedCommittedFiles);
  const missingFiles = input.evidence.changedFiles.filter(
    (file) => !trustedSet.has(file.toLowerCase()),
  );
  if (missingFiles.length > 0) {
    return {
      ok: false,
      error: `operator_verified_completion rejected: reason=changed_file_not_in_commit_diff files=${missingFiles.join(",")}`,
    };
  }
  const declaredSet = normalizeSet(input.evidence.changedFiles);
  const dirtyRelevantBoundaries = [
    ...input.evidence.changedFiles,
    ...(input.approvedDirtyFileBoundaries ?? []),
  ];
  const undeclaredCommitFiles = trustedCommittedFiles.filter(
    (file) => !declaredSet.has(file.toLowerCase()),
  );
  if (undeclaredCommitFiles.length > 0) {
    return {
      ok: false,
      error: `operator_verified_completion rejected: reason=undeclared_commit_files files=${undeclaredCommitFiles.join(",")}`,
    };
  }

  const dirtySet = normalizeSet(
    parseStatusFiles(
      runGit(input.projectRoot, ["status", "--porcelain=v1", "--untracked-files=all"]),
    ),
  );
  const dirtyRelevant = [...dirtySet]
    .filter((file) =>
      dirtyRelevantBoundaries.some((boundary) => pathMatchesRelevantBoundary(file, boundary)),
    )
    .sort((a, b) => a.localeCompare(b));
  if (dirtyRelevant.length > 0) {
    return {
      ok: false,
      error: `operator_verified_completion rejected: reason=dirty_relevant_worktree files=${dirtyRelevant.join(",")}`,
    };
  }
  const dirtyUnrelatedFiles = [...dirtySet]
    .filter(
      (file) =>
        !dirtyRelevantBoundaries.some((boundary) => pathMatchesRelevantBoundary(file, boundary)),
    )
    .sort((a, b) => a.localeCompare(b));

  return { ok: true, evidence: { trustedCommittedFiles, dirtyUnrelatedFiles } };
}

function hasPendingChecklist(task: TaskRow): boolean {
  if (!task.implementationManifestJson) return false;
  try {
    const parsed = JSON.parse(task.implementationManifestJson) as { planChecklist?: unknown };
    const checklist = parsed.planChecklist as
      | { pending?: unknown; pendingItems?: unknown }
      | undefined;
    return typeof checklist?.pending === "number" && checklist.pending > 0;
  } catch {
    return false;
  }
}

function unresolvedBlockers(task: TaskRow): string[] {
  if (isManualReviewBlockedTask(task)) return ["manual_review_required"];
  let state: { findings?: Array<{ id?: string; status?: string }> } | null = null;
  if (task.autoReviewStateJson) {
    try {
      const parsed = JSON.parse(task.autoReviewStateJson);
      state =
        parsed && typeof parsed === "object" && !Array.isArray(parsed)
          ? (parsed as { findings?: Array<{ id?: string; status?: string }> })
          : null;
    } catch {
      return ["invalid_auto_review_state"];
    }
  }
  return (state?.findings ?? [])
    .filter((finding) =>
      ["still_blocking", "new_blocker", "manual_review_required"].includes(finding.status ?? ""),
    )
    .map((finding) => finding.id ?? "unknown");
}

function auditEvidenceForTask(
  task: TaskRow,
  auditArtifact: ReturnType<typeof findRoadmapBatchArtifactByTaskId>,
) {
  if (!auditArtifact) return [];
  return listAuditEvidenceEvents({
    taskId: task.id,
    auditPlanId: resolveAuditPlanId({ taskId: task.id, roadmapBatchId: auditArtifact.batchId }),
    limit: 200,
  });
}

function buildOperatorImplementationManifest(input: {
  task: TaskRow;
  evidence: OperatorCompletionEvidence;
  trustedCommittedFiles: string[];
}) {
  const intent = inferTaskIntent({
    taskIntent: input.task.taskIntent === "general" ? null : input.task.taskIntent,
    isFix: input.task.isFix,
    title: input.task.title,
    description: input.task.description,
    roadmapAlias: input.task.roadmapAlias,
    tags: input.task.tags,
  });
  if (!isDevelopmentImplementationIntent(intent)) return null;
  const evidenceRefs = input.evidence.verification.map((_, index) => `operator-ver-${index + 1}`);
  const planManifest = readAifPlanManifestSnapshot(input.task.plan);
  const acceptanceCriterionIds =
    planManifest.acceptanceCriterionIds.length > 0
      ? planManifest.acceptanceCriterionIds
      : ["operator-verified-completion"];
  return {
    version: 1,
    taskId: input.task.id,
    intent,
    planManifestHash: hashAifPlanManifest(input.task.plan),
    changedFiles: input.trustedCommittedFiles.map((path) => ({
      path,
      status: "modified" as const,
    })),
    diffSummary: {
      summary: `Operator verified committed changes in ${input.evidence.commitSha}.`,
      filesChanged: input.trustedCommittedFiles.length,
    },
    verificationEvidence: input.evidence.verification.map((entry, index) => ({
      id: evidenceRefs[index],
      command: entry.command,
      status: "passed" as const,
      outputSha256: entry.outputSha256,
      outputPreview: entry.outputPreview,
      outputPreviewTruncated: false,
    })),
    acceptanceCriteria: acceptanceCriterionIds.map((id) => ({
      id,
      status: "satisfied" as const,
      evidenceRefs,
    })),
    evidenceRefs,
    planChecklist: {
      total: acceptanceCriterionIds.length,
      completed: acceptanceCriterionIds.length,
      pending: 0,
      synced: true,
      pendingItems: [],
    },
    reviewClosure: input.task.skipReview
      ? { status: "skipped" as const, evidenceRefs }
      : { status: "pending" as const, evidenceRefs: [] },
    commitEvidence: {
      status: "committed" as const,
      commitSha: input.evidence.commitSha,
      evidenceRefs,
      notes: "Validated by operator_verified_completion.",
    },
    regressionExplanation: intent === "fix" ? "Operator verified committed fix evidence." : null,
    knownLimitations: [],
  };
}

function nextStatusForOperatorCloseout(task: TaskRow): TaskRow["status"] {
  if (!task.skipReview) return "review";
  const env = getEnv();
  if (env.AIF_REQUIREMENTS_INTAKE_ENABLED && env.AIF_REQUIREMENTS_QA_ENABLED) return "qa";
  return "done";
}

function reject(taskId: string, status: number, error: string): OperatorVerifiedCompletionResult {
  appendTaskActivityLog(taskId, `[${new Date().toISOString()}] ${error}`);
  return { ok: false, status, error };
}

function formatImplementationManifestRejection(
  result: ReturnType<typeof validateImplementationManifest>,
): string {
  const codes = result.issues.map((issue) => issue.code);
  return `operator_verified_completion rejected: reason=implementation_manifest_invalid codes=${codes.join(",") || "unknown"}`;
}

export function handleOperatorVerifiedCompletion(
  input: OperatorVerifiedCompletionInput,
): OperatorVerifiedCompletionResult {
  const task = findTaskById(input.taskId);
  if (!task) return { ok: false, status: 404, error: "Task not found" };
  if (!["blocked_external", "implementing", "review", "done"].includes(task.status)) {
    return reject(task.id, 409, "operator_verified_completion rejected: reason=status_not_allowed");
  }
  if (task.manualReviewRequired) {
    return reject(
      task.id,
      409,
      "operator_verified_completion rejected: reason=manual_review_required",
    );
  }
  if (hasPendingChecklist(task)) {
    return reject(
      task.id,
      409,
      "operator_verified_completion rejected: reason=pending_checklist_items",
    );
  }

  const blockers = unresolvedBlockers(task);
  const overrideAllowed =
    input.allowBlockerOverride === true &&
    task.taskIntent !== "audit" &&
    typeof input.blockerOverrideJustification === "string" &&
    input.blockerOverrideJustification.trim().length > 0;
  if (blockers.length > 0 && !overrideAllowed) {
    return reject(
      task.id,
      409,
      `operator_verified_completion rejected: reason=unresolved_blockers blockers=${blockers.join(",")}`,
    );
  }

  const project = findProjectById(task.projectId);
  if (!project) return { ok: false, status: 404, error: "Project not found" };
  const projectRoot = task.worktreePath ?? project.rootPath;
  const acceptedAt = new Date().toISOString();
  const evidence = coerceOperatorCompletionEvidence({
    version: 1,
    taskId: task.id,
    source: "operator",
    status: "accepted",
    commitSha: input.commitSha,
    changedFiles: input.changedFiles,
    verification: input.verification,
    worktreeClean: input.worktreeClean,
    operatorNote: input.operatorNote ?? null,
    overriddenBlockers: overrideAllowed ? blockers : [],
    blockerOverrideJustification: overrideAllowed
      ? input.blockerOverrideJustification?.trim()
      : null,
    acceptedAt,
  });
  if (!evidence) {
    return reject(
      task.id,
      400,
      "operator_verified_completion rejected: reason=invalid_operator_evidence",
    );
  }

  const planManifest = readAifPlanManifestSnapshot(task.plan);
  const gitValidation = validateGitEvidence({
    projectRoot,
    evidence,
    approvedDirtyFileBoundaries: [...planManifest.scope, ...planManifest.expectedArtifactPaths],
  });
  if (!gitValidation.ok) return reject(task.id, 409, gitValidation.error);
  const gitEvidence = gitValidation.evidence;
  const acceptedEvidence: OperatorCompletionEvidence = {
    ...evidence,
    relevantWorktreeClean: true,
    dirtyUnrelatedFiles: gitEvidence.dirtyUnrelatedFiles,
  };

  const auditArtifact = findRoadmapBatchArtifactByTaskId(task.id);
  if (task.taskIntent === "audit" || auditArtifact) {
    const auditResult = evaluateTaskCompletionEvidence({
      task: {
        ...task,
        expectedReportArtifactPath: auditArtifact?.artifactPath,
        auditArtifactRole:
          auditArtifact?.role === "synthesis" ? "synthesis" : auditArtifact ? "report" : null,
        roadmapBatchId: auditArtifact?.batchId ?? null,
      },
      projectRoot,
      auditEvidenceUnits: auditEvidenceForTask(task, auditArtifact),
      requireAuditLedgerEvidence: Boolean(auditArtifact),
    });
    if (!auditResult.ok) {
      return reject(
        task.id,
        409,
        `operator_verified_completion rejected: reason=${formatTaskCompletionBlockedReason(auditResult)}`,
      );
    }
    if (auditArtifact) {
      updateRoadmapBatchArtifactState({
        taskId: task.id,
        state: "valid",
        failureFamily: null,
        reworkStatus: "accepted",
        validationDetails: {
          action: "operator_verified_completion",
          evidence: acceptedEvidence,
          completionEvidence: auditResult.evidence,
        },
        contentSha: auditResult.evidence.auditReportValidation.artifactSha256,
        branchName: task.branchName ?? auditArtifact.branchName,
        worktreePath: task.worktreePath ?? auditArtifact.worktreePath,
        projectRoot,
      });
    }
  }

  const manifest = buildOperatorImplementationManifest({
    task,
    evidence: acceptedEvidence,
    trustedCommittedFiles: gitEvidence.trustedCommittedFiles,
  });
  const nextStatus = nextStatusForOperatorCloseout(task);
  if (manifest) {
    const manifestValidation = validateImplementationManifest({
      task,
      manifestJson: JSON.stringify(manifest),
      changedFiles: gitEvidence.trustedCommittedFiles,
      meaningfulChangedFiles: [],
      dirtyChangedFiles: [],
      trustedCommittedChangedFiles: gitEvidence.trustedCommittedFiles,
      trustedVerificationCommands: acceptedEvidence.verification.map((entry) => entry.command),
      phase: nextStatus === "done" ? "completion" : "review_handoff",
    });
    if (!manifestValidation.ok) {
      return reject(task.id, 409, formatImplementationManifestRejection(manifestValidation));
    }
  }
  const firstVerification = acceptedEvidence.verification[0];
  setTaskFields(task.id, {
    status: nextStatus,
    blockedReason: null,
    blockedFromStatus: null,
    retryAfter: null,
    retryCount: 0,
    reworkRequested: false,
    manualReviewRequired: false,
    paused: false,
    implementationManifestJson: manifest
      ? JSON.stringify(manifest)
      : task.implementationManifestJson,
    lastHeartbeatAt: acceptedAt,
    updatedAt: acceptedAt,
  });
  recordTaskStageArtifactAttempt({
    taskId: task.id,
    stage: "operator_verified_completion",
    kind: "test_result",
    label: "Operator verified completion",
    state: "accepted",
    outcome: "supported",
    trustLevel: "trusted",
    summary: `Operator accepted ${gitEvidence.trustedCommittedFiles.length} committed file(s).`,
    metadata: {
      evidence: acceptedEvidence,
      trustedCommittedFiles: gitEvidence.trustedCommittedFiles,
      relevantWorktreeClean: true,
      dirtyUnrelatedFiles: gitEvidence.dirtyUnrelatedFiles,
      blockerOverride: overrideAllowed
        ? {
            blockers,
            justification: input.blockerOverrideJustification?.trim(),
          }
        : null,
    },
  });
  appendTaskActivityLog(
    task.id,
    `[${acceptedAt}] operator_verified_completion accepted: commit=${acceptedEvidence.commitSha}; verification=${firstVerification.command}; outputSha=${firstVerification.outputSha256}; files=${gitEvidence.trustedCommittedFiles.join(",")};${overrideAllowed ? ` blockerOverride=${blockers.join(",")};` : ""} nextStatus=${nextStatus}`,
  );

  const updated = findTaskById(task.id);
  if (!updated) return { ok: false, status: 404, error: "Task not found after closeout" };
  return { ok: true, task: updated, evidence: acceptedEvidence, nextStatus };
}
