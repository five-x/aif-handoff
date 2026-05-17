/**
 * Attachment persistence pipeline: converts incoming attachment payloads
 * into file-backed metadata under the project's .ai-factory/files directory.
 */

import {
  ATTACHMENT_MAX_BYTES,
  isAllowedAttachmentMimeType,
  isBinaryAttachmentMimeType,
  isSafeAttachmentFilename,
  isSafeAttachmentStoragePath,
  isTextAttachmentMimeType,
  isValidBase64AttachmentContent,
  logger,
  normalizeAttachmentMimeType,
  redactAttachmentTextContent,
  type AttachmentRedactionStatus,
  type AttachmentSourceKind,
} from "@aif/shared";
import { saveAttachment, deleteAttachment } from "./attachmentStorage.js";

const log = logger("attachmentPersistence");

interface IncomingAttachment {
  name: string;
  mimeType: string;
  size: number;
  content: string | null;
  path?: string;
  sourceKind?: AttachmentSourceKind;
  sourceRef?: string;
  redactionStatus?: AttachmentRedactionStatus;
}

interface PersistedAttachment {
  name: string;
  mimeType: string;
  size: number;
  content: string | null;
  path?: string;
  sourceKind?: AttachmentSourceKind;
  sourceRef?: string;
  redactionStatus?: AttachmentRedactionStatus;
}

interface AttachmentEntityContext {
  projectRoot: string;
  taskId?: string;
  commentId?: string;
  chatSessionId?: string;
}

export class AttachmentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AttachmentValidationError";
  }
}

function sourceKindForContext(entityContext: AttachmentEntityContext): AttachmentSourceKind {
  if (entityContext.chatSessionId) return "chat";
  if (entityContext.commentId) return "comment";
  return "task";
}

function sourceRefForContext(entityContext: AttachmentEntityContext): string {
  if (entityContext.chatSessionId) return `chat:session:${entityContext.chatSessionId}`;
  if (entityContext.taskId && entityContext.commentId) {
    return `task:${entityContext.taskId}:comment:${entityContext.commentId}`;
  }
  if (entityContext.taskId) return `task:${entityContext.taskId}`;
  return "attachment:unknown";
}

function withProvenance(
  attachment: Pick<PersistedAttachment, "name" | "mimeType" | "size" | "content" | "path">,
  entityContext: AttachmentEntityContext,
  redactionStatus: AttachmentRedactionStatus,
): PersistedAttachment {
  return {
    ...attachment,
    sourceKind: sourceKindForContext(entityContext),
    sourceRef: sourceRefForContext(entityContext),
    redactionStatus,
  };
}

function validateAttachmentMetadata(attachment: IncomingAttachment): void {
  if (!isSafeAttachmentFilename(attachment.name)) {
    throw new AttachmentValidationError("Unsafe attachment filename");
  }
  if (!isAllowedAttachmentMimeType(attachment.mimeType)) {
    throw new AttachmentValidationError("Unsupported attachment MIME type");
  }
  if (
    !Number.isInteger(attachment.size) ||
    attachment.size < 0 ||
    attachment.size > ATTACHMENT_MAX_BYTES
  ) {
    throw new AttachmentValidationError("Attachment size exceeds limit");
  }
}

function assertDecodedSize(buffer: Buffer): void {
  if (buffer.length > ATTACHMENT_MAX_BYTES) {
    throw new AttachmentValidationError("Decoded attachment size exceeds limit");
  }
}

function decodeBase64Content(content: string): Buffer {
  if (!isValidBase64AttachmentContent(content)) {
    throw new AttachmentValidationError("Binary attachment content must be valid base64");
  }
  const compact = (content.match(/^data:[^;]+;base64,(.+)$/s)?.[1] ?? content).replace(/\s/g, "");
  return Buffer.from(compact, "base64");
}

function decodeContent(content: string, mimeType: string): Buffer {
  if (content.match(/^data:[^;]+;base64,/s)) {
    return decodeBase64Content(content);
  }
  if (isBinaryAttachmentMimeType(mimeType)) {
    return decodeBase64Content(content);
  }
  return Buffer.from(content, "utf-8");
}

/**
 * Persist incoming attachments to the project's .ai-factory/files directory
 * and return DB-ready metadata.
 */
export async function persistAttachments(
  attachments: IncomingAttachment[],
  entityContext: AttachmentEntityContext,
): Promise<PersistedAttachment[]> {
  if (attachments.length === 0) return [];

  log.info(
    {
      taskId: entityContext.taskId,
      chatSessionId: entityContext.chatSessionId,
      commentId: entityContext.commentId,
      count: attachments.length,
      totalBytes: attachments.reduce((sum, a) => sum + a.size, 0),
    },
    "Persisting attachments to project files",
  );

  const persisted: PersistedAttachment[] = [];

  for (const attachment of attachments) {
    validateAttachmentMetadata(attachment);
    const mimeType = normalizeAttachmentMimeType(attachment.mimeType);

    if (attachment.path) {
      if (!isSafeAttachmentStoragePath(attachment.path, entityContext)) {
        throw new AttachmentValidationError("Unsafe attachment storage path");
      }
      persisted.push(
        withProvenance(
          {
            name: attachment.name,
            mimeType,
            size: attachment.size,
            content: null,
            path: attachment.path,
          },
          entityContext,
          attachment.redactionStatus ??
            (isTextAttachmentMimeType(mimeType) ? "none" : "not_scanned"),
        ),
      );
      continue;
    }

    if (attachment.content === null) {
      persisted.push(
        withProvenance(
          {
            name: attachment.name,
            mimeType,
            size: attachment.size,
            content: null,
          },
          entityContext,
          isTextAttachmentMimeType(mimeType) ? "none" : "not_scanned",
        ),
      );
      continue;
    }

    let buffer = decodeContent(attachment.content, mimeType);
    let redactionStatus: AttachmentRedactionStatus = "not_scanned";
    if (isTextAttachmentMimeType(mimeType)) {
      const redacted = redactAttachmentTextContent(buffer.toString("utf-8"));
      buffer = Buffer.from(redacted.content, "utf-8");
      redactionStatus = redacted.redactionStatus;
    }
    assertDecodedSize(buffer);

    const result = await saveAttachment({
      projectRoot: entityContext.projectRoot,
      taskId: entityContext.taskId,
      commentId: entityContext.commentId,
      chatSessionId: entityContext.chatSessionId,
      filename: attachment.name,
      content: buffer,
    });

    log.debug(
      { name: attachment.name, relativePath: result.relativePath, size: result.size },
      "Attachment written to project files",
    );

    persisted.push(
      withProvenance(
        {
          name: result.sanitizedName,
          mimeType,
          size: result.size,
          content: null,
          path: result.relativePath,
        },
        entityContext,
        redactionStatus,
      ),
    );
  }

  return persisted;
}

/**
 * Clean up storage files for attachments that are being replaced.
 * Call this after the replacement metadata has been persisted successfully.
 */
export function cleanupReplacedAttachments(
  projectRoot: string,
  oldAttachments: PersistedAttachment[],
  newAttachments: IncomingAttachment[],
): void {
  const newPaths = new Set(newAttachments.filter((a) => a.path).map((a) => a.path!));

  for (const old of oldAttachments) {
    if (old.path && !newPaths.has(old.path)) {
      log.debug({ path: old.path }, "Cleaning up replaced attachment");
      deleteAttachment(projectRoot, old.path);
    }
  }
}
