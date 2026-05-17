import { existsSync, mkdirSync, unlinkSync, readdirSync, rmSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join, normalize, basename, extname, resolve, relative, isAbsolute } from "node:path";
import { isSafeAttachmentFilename, logger } from "@aif/shared";

const log = logger("attachmentStorage");

/** Base directory inside project root for attachment files */
const FILES_DIR = ".ai-factory/files";

/** Max filename length after sanitization */
const MAX_FILENAME_LENGTH = 200;

/**
 * Sanitize a filename: strip path separators, collapse whitespace,
 * replace dangerous characters, and truncate.
 */
export function sanitizeFilename(raw: string): string {
  let name = basename(raw);
  // Remove null bytes and control characters
  name = name.replace(/[\x00-\x1f]/g, "");
  // Replace path separators and other dangerous characters
  name = name.replace(/[/\\:*?"<>|]/g, "_");
  // Collapse whitespace
  name = name.replace(/\s+/g, " ").trim();
  // Ensure non-empty
  if (!name || name === "." || name === "..") {
    name = "unnamed";
  }
  // Truncate preserving extension
  if (name.length > MAX_FILENAME_LENGTH) {
    const ext = extname(name);
    const stem = name.slice(0, MAX_FILENAME_LENGTH - ext.length);
    name = stem + ext;
  }
  return name;
}

/**
 * Build the deterministic directory path for a task's attachments.
 */
function taskAttachmentDir(projectRoot: string, taskId: string): string {
  return join(projectRoot, FILES_DIR, "tasks", taskId);
}

/**
 * Build the deterministic directory path for a comment's attachments.
 */
function commentAttachmentDir(projectRoot: string, taskId: string, commentId: string): string {
  return join(projectRoot, FILES_DIR, "tasks", taskId, "comments", commentId);
}

/**
 * Build the deterministic directory path for a chat session's attachments.
 */
function chatAttachmentDir(projectRoot: string, chatSessionId: string): string {
  return join(projectRoot, FILES_DIR, "chat", chatSessionId);
}

/**
 * Validate that a resolved path stays within the expected base directory.
 * Prevents path traversal attacks.
 */
function assertWithinBase(resolvedPath: string, baseDir: string): void {
  const normalizedResolved = normalize(resolvedPath);
  const normalizedBase = normalize(baseDir);
  const relativePath = relative(normalizedBase, normalizedResolved);
  if (relativePath === "" || relativePath.startsWith("..") || isAbsolute(relativePath)) {
    log.error(
      { resolvedPath: normalizedResolved, baseDir: normalizedBase },
      "Path traversal attempt blocked",
    );
    throw new Error("Path traversal detected");
  }
}

/**
 * Resolve a DB-stored relative attachment path to an absolute filesystem path.
 *
 * @param projectRoot - Absolute path to the project root directory
 * @param relativePath - e.g. ".ai-factory/files/tasks/<tid>/file.png"
 * @returns Absolute path on disk
 */
export function resolveAttachmentPath(projectRoot: string, relativePath: string): string {
  const resolved = resolve(projectRoot, relativePath);
  assertWithinBase(resolved, join(projectRoot, FILES_DIR));
  log.debug({ relativePath, resolved }, "Resolved attachment path");
  return resolved;
}

export interface SaveAttachmentInput {
  projectRoot: string;
  taskId?: string;
  commentId?: string;
  chatSessionId?: string;
  filename: string;
  content: Buffer;
}

export interface SaveAttachmentResult {
  /** Relative path from project root (stored in DB) */
  relativePath: string;
  /** Sanitized filename */
  sanitizedName: string;
  /** Bytes written */
  size: number;
}

/**
 * Save an attachment file to disk inside the project's .ai-factory/files/ directory.
 * Creates directories as needed. Returns the relative path for DB storage.
 */
export async function saveAttachment(input: SaveAttachmentInput): Promise<SaveAttachmentResult> {
  if (!isSafeAttachmentFilename(input.filename)) {
    throw new Error("Unsafe attachment filename");
  }
  const sanitizedName = sanitizeFilename(input.filename);
  let dir: string;
  if (input.chatSessionId) {
    dir = chatAttachmentDir(input.projectRoot, input.chatSessionId);
  } else if (input.commentId && input.taskId) {
    dir = commentAttachmentDir(input.projectRoot, input.taskId, input.commentId);
  } else if (input.taskId) {
    dir = taskAttachmentDir(input.projectRoot, input.taskId);
  } else {
    throw new Error("Either taskId or chatSessionId is required");
  }

  const absolutePath = join(dir, sanitizedName);
  assertWithinBase(absolutePath, join(input.projectRoot, FILES_DIR));

  log.debug(
    {
      projectRoot: input.projectRoot,
      taskId: input.taskId,
      commentId: input.commentId,
      filename: sanitizedName,
      dir,
    },
    "Planning attachment save path and directory creation",
  );

  mkdirSync(dir, { recursive: true });
  await writeFile(absolutePath, input.content);

  // Store path relative to project root so agents can read it directly
  const relativePath = absolutePath.slice(input.projectRoot.length + 1);

  log.info(
    {
      taskId: input.taskId,
      commentId: input.commentId,
      filename: sanitizedName,
      size: input.content.length,
      relativePath,
    },
    "Attachment saved to project files",
  );

  return {
    relativePath,
    sanitizedName,
    size: input.content.length,
  };
}

/**
 * Read an attachment file from disk.
 *
 * @param projectRoot - Absolute path to the project root directory
 * @param relativePath - Relative path as stored in DB
 * @returns File buffer
 */
export async function readAttachment(projectRoot: string, relativePath: string): Promise<Buffer> {
  const absolutePath = resolveAttachmentPath(projectRoot, relativePath);
  log.debug({ relativePath }, "Reading attachment from project files");
  return readFile(absolutePath);
}

/**
 * Delete a single attachment file from disk.
 *
 * @param projectRoot - Absolute path to the project root directory
 * @param relativePath - Relative path as stored in DB
 * @returns true if deleted, false if file did not exist
 */
export function deleteAttachment(projectRoot: string, relativePath: string): boolean {
  const absolutePath = resolveAttachmentPath(projectRoot, relativePath);
  try {
    unlinkSync(absolutePath);
    log.info({ relativePath }, "Attachment deleted from project files");
    return true;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      log.warn({ relativePath }, "Attachment file not found during delete (already removed)");
      return false;
    }
    log.error({ relativePath, err }, "Failed to delete attachment file");
    throw err;
  }
}

/**
 * Clean up all attachment files for a task (including comment attachments).
 * Removes the entire task directory under .ai-factory/files/.
 *
 * @returns Number of files removed, or -1 if directory didn't exist
 */
export function cleanupTaskAttachmentFiles(projectRoot: string, taskId: string): number {
  const dir = taskAttachmentDir(projectRoot, taskId);
  if (!existsSync(dir)) {
    log.warn({ taskId, dir }, "Task attachment directory not found during cleanup");
    return -1;
  }

  let count = 0;
  try {
    count = countFiles(dir);
    rmSync(dir, { recursive: true, force: true });
    log.info({ taskId, filesRemoved: count }, "Task attachment directory cleaned up");
  } catch (err) {
    log.error({ taskId, err }, "Failed to clean up task attachment directory");
    throw err;
  }
  return count;
}

/**
 * Count files recursively in a directory.
 */
function countFiles(dir: string): number {
  let count = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      count += countFiles(join(dir, entry.name));
    } else {
      count++;
    }
  }
  return count;
}

/**
 * Check if an attachment file exists on disk.
 */
export function attachmentFileExists(projectRoot: string, relativePath: string): boolean {
  const absolutePath = resolveAttachmentPath(projectRoot, relativePath);
  return existsSync(absolutePath);
}
