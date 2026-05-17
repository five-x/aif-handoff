import { beforeEach, describe, expect, it, vi } from "vitest";

const saveAttachmentMock = vi.fn();
const deleteAttachmentMock = vi.fn();

vi.mock("../services/attachmentStorage.js", () => ({
  saveAttachment: (...args: unknown[]) => saveAttachmentMock(...args),
  deleteAttachment: (...args: unknown[]) => deleteAttachmentMock(...args),
}));

const { AttachmentValidationError, cleanupReplacedAttachments, persistAttachments } =
  await import("../services/attachmentPersistence.js");

describe("attachmentPersistence", () => {
  beforeEach(() => {
    saveAttachmentMock.mockReset();
    deleteAttachmentMock.mockReset();
  });

  it("returns empty list when no attachments are provided", async () => {
    const result = await persistAttachments([], { projectRoot: "/tmp/project" });
    expect(result).toEqual([]);
    expect(saveAttachmentMock).not.toHaveBeenCalled();
  });

  it("keeps already file-backed attachments only under the expected context", async () => {
    const result = await persistAttachments(
      [
        {
          name: "existing.txt",
          mimeType: "text/plain",
          size: 5,
          content: null,
          path: ".ai-factory/files/tasks/task-1/existing.txt",
        },
      ],
      { projectRoot: "/tmp/project", taskId: "task-1" },
    );

    expect(result).toEqual([
      {
        name: "existing.txt",
        mimeType: "text/plain",
        size: 5,
        content: null,
        path: ".ai-factory/files/tasks/task-1/existing.txt",
        sourceKind: "task",
        sourceRef: "task:task-1",
        redactionStatus: "none",
      },
    ]);
    expect(saveAttachmentMock).not.toHaveBeenCalled();
  });

  it("rejects unsafe file-backed paths", async () => {
    await expect(
      persistAttachments(
        [
          {
            name: "existing.txt",
            mimeType: "text/plain",
            size: 5,
            content: null,
            path: "../outside.txt",
          },
        ],
        { projectRoot: "/tmp/project", taskId: "task-1" },
      ),
    ).rejects.toBeInstanceOf(AttachmentValidationError);
  });

  it("stores metadata-only attachments with provenance when content is null", async () => {
    const result = await persistAttachments(
      [{ name: "meta.txt", mimeType: "text/plain", size: 0, content: null }],
      { projectRoot: "/tmp/project", taskId: "task-1" },
    );

    expect(result).toEqual([
      {
        name: "meta.txt",
        mimeType: "text/plain",
        size: 0,
        content: null,
        sourceKind: "task",
        sourceRef: "task:task-1",
        redactionStatus: "none",
      },
    ]);
    expect(saveAttachmentMock).not.toHaveBeenCalled();
  });

  it("writes data-URI attachment content and returns file-backed metadata", async () => {
    saveAttachmentMock.mockImplementationOnce(async (input: { content: Buffer }) => ({
      relativePath: ".ai-factory/files/tasks/task-1/note.txt",
      sanitizedName: "note.txt",
      size: input.content.length,
    }));

    const result = await persistAttachments(
      [
        {
          name: "note.txt",
          mimeType: "text/plain",
          size: 5,
          content: "data:text/plain;base64,aGVsbG8=",
        },
      ],
      { projectRoot: "/tmp/project", taskId: "task-1" },
    );

    expect(saveAttachmentMock).toHaveBeenCalledTimes(1);
    const savedPayload = saveAttachmentMock.mock.calls[0]![0] as { content: Buffer };
    expect(savedPayload.content.toString("utf-8")).toBe("hello");
    expect(result).toEqual([
      {
        name: "note.txt",
        mimeType: "text/plain",
        size: 5,
        content: null,
        path: ".ai-factory/files/tasks/task-1/note.txt",
        sourceKind: "task",
        sourceRef: "task:task-1",
        redactionStatus: "none",
      },
    ]);
  });

  it("decodes valid base64 for binary MIME attachments", async () => {
    saveAttachmentMock.mockImplementationOnce(async (input: { content: Buffer }) => ({
      relativePath: ".ai-factory/files/tasks/task-1/image.png",
      sanitizedName: "image.png",
      size: input.content.length,
    }));

    await persistAttachments(
      [
        {
          name: "image.png",
          mimeType: "image/png",
          size: 5,
          content: "aGVsbG8=",
        },
      ],
      { projectRoot: "/tmp/project", taskId: "task-1" },
    );

    const savedPayload = saveAttachmentMock.mock.calls[0]![0] as { content: Buffer };
    expect(savedPayload.content.toString("utf-8")).toBe("hello");
  });

  it("rejects invalid binary base64 instead of treating it as text", async () => {
    await expect(
      persistAttachments(
        [
          {
            name: "raw.pdf",
            mimeType: "application/pdf",
            size: 12,
            content: "not-base64###",
          },
        ],
        { projectRoot: "/tmp/project", taskId: "task-1" },
      ),
    ).rejects.toBeInstanceOf(AttachmentValidationError);
    expect(saveAttachmentMock).not.toHaveBeenCalled();
  });

  it("rejects unsafe filenames", async () => {
    await expect(
      persistAttachments(
        [{ name: "../secret.txt", mimeType: "text/plain", size: 4, content: "test" }],
        { projectRoot: "/tmp/project", taskId: "task-1" },
      ),
    ).rejects.toBeInstanceOf(AttachmentValidationError);
  });

  it("surfaces storage write failures instead of storing metadata-only fallbacks", async () => {
    saveAttachmentMock.mockRejectedValueOnce(new Error("disk full"));

    await expect(
      persistAttachments(
        [
          {
            name: "failed.txt",
            mimeType: "text/plain",
            size: 4,
            content: "data:text/plain;base64,dGVzdA==",
          },
        ],
        { projectRoot: "/tmp/project", taskId: "task-1" },
      ),
    ).rejects.toThrow("disk full");
  });

  it("cleans up replaced attachment files only when path is removed", () => {
    cleanupReplacedAttachments(
      "/tmp/project",
      [
        { name: "keep", mimeType: "text/plain", size: 1, content: null, path: "keep.txt" },
        { name: "drop", mimeType: "text/plain", size: 1, content: null, path: "drop.txt" },
        { name: "meta", mimeType: "text/plain", size: 1, content: null },
      ],
      [
        {
          name: "keep",
          mimeType: "text/plain",
          size: 1,
          content: null,
          path: "keep.txt",
        },
      ],
    );

    expect(deleteAttachmentMock).toHaveBeenCalledTimes(1);
    expect(deleteAttachmentMock).toHaveBeenCalledWith("/tmp/project", "drop.txt");
  });
});
