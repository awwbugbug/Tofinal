import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createAttachmentFileStorage,
  MAX_IMAGE_BYTES,
  type AttachmentFileStorageRuntime,
} from "@/storage/attachmentFileStorage";

const bytes = (size: number) => new Uint8Array(size);

const createRuntime = (overrides: Partial<AttachmentFileStorageRuntime> = {}) => {
  const files = new Map<string, Uint8Array>([
    ["C:\\Users\\Tester\\Pictures\\sample.png", bytes(4)],
    ["C:\\Users\\Tester\\Pictures\\large.png", bytes(MAX_IMAGE_BYTES + 1)],
  ]);

  const runtime: AttachmentFileStorageRuntime = {
    async pickImageFiles() {
      return [];
    },
    async readDroppedImage(path) {
      const file = files.get(path);
      if (!file) {
        throw new Error("Dropped file is unavailable.");
      }

      return { fileName: path.split(/[\\/]/).pop() ?? path, bytes: file };
    },
    async stat(path) {
      const file = files.get(path);
      if (!file) {
        throw new Error("not found");
      }

      return { isFile: true, size: file.byteLength };
    },
    async readFile(path) {
      const file = files.get(path);
      if (!file) {
        throw new Error("not found");
      }

      return file;
    },
    async writeFile(path, data) {
      files.set(path, data);
    },
    async mkdir() {},
    async remove(path) {
      files.delete(path);
    },
    async exists(path) {
      return files.has(path);
    },
    createObjectUrl(data, mimeType) {
      return `blob:${mimeType}:${data.byteLength}`;
    },
    ...overrides,
  };

  return { files, runtime };
};

describe("attachment file storage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("copies a valid image into the app-owned attachments relative path", async () => {
    const { files, runtime } = createRuntime();
    const storage = createAttachmentFileStorage(runtime);

    const copied = await storage.copyImageToAppData({
      attachmentId: "attachment-1",
      sourcePath: "C:\\Users\\Tester\\Pictures\\sample.png",
      taskId: "task-1",
    });

    expect(copied).toMatchObject({
      originalName: "sample.png",
      storedName: "attachment-1.png",
      relativePath: "attachments/images/task-1/attachment-1.png",
      mimeType: "image/png",
      sizeBytes: 4,
    });
    expect(files.has("attachments/images/task-1/attachment-1.png")).toBe(true);
  });

  it("imports a dropped image through the narrow read command into AppData", async () => {
    const { files, runtime } = createRuntime();
    const storage = createAttachmentFileStorage(runtime);

    const imported = await storage.importDroppedImageToAppData({
      attachmentId: "attachment-2",
      sourcePath: "C:\\Users\\Tester\\Pictures\\sample.png",
      taskId: "task-1",
    });

    expect(imported).toMatchObject({
      originalName: "sample.png",
      storedName: "attachment-2.png",
      relativePath: "attachments/images/task-1/attachment-2.png",
      mimeType: "image/png",
      sizeBytes: 4,
    });
    expect(files.has("attachments/images/task-1/attachment-2.png")).toBe(true);
  });

  it("writes pasted image bytes into AppData and validates mime and size", async () => {
    const { files, runtime } = createRuntime();
    const storage = createAttachmentFileStorage(runtime);

    const pasted = await storage.writePastedImageToAppData({
      attachmentId: "attachment-3",
      bytes: bytes(6),
      mimeType: "image/jpeg",
      originalName: "pasted-20260705-120000.jpg",
      taskId: "task-1",
    });

    expect(pasted).toMatchObject({
      originalName: "pasted-20260705-120000.jpg",
      storedName: "attachment-3.jpg",
      relativePath: "attachments/images/task-1/attachment-3.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 6,
    });
    expect(files.has("attachments/images/task-1/attachment-3.jpg")).toBe(true);

    await expect(
      storage.writePastedImageToAppData({
        attachmentId: "attachment-4",
        bytes: bytes(4),
        mimeType: "image/gif",
        originalName: "pasted.gif",
        taskId: "task-1",
      }),
    ).rejects.toThrow(/unsupported image type/i);
    await expect(
      storage.writePastedImageToAppData({
        attachmentId: "attachment-4",
        bytes: bytes(MAX_IMAGE_BYTES + 1),
        mimeType: "image/png",
        originalName: "pasted.png",
        taskId: "task-1",
      }),
    ).rejects.toThrow(/larger than 10 mb/i);
  });

  it("rejects dropped files with unsupported extensions or excess size", async () => {
    const writeFile = vi.fn();
    const { runtime } = createRuntime({
      writeFile,
      async readDroppedImage(path) {
        if (path.endsWith("large.png")) {
          return { fileName: "large.png", bytes: bytes(MAX_IMAGE_BYTES + 1) };
        }
        return { fileName: "sample.gif", bytes: bytes(4) };
      },
    });
    const storage = createAttachmentFileStorage(runtime);

    await expect(
      storage.importDroppedImageToAppData({
        attachmentId: "attachment-2",
        sourcePath: "C:\\Users\\Tester\\Pictures\\sample.gif",
        taskId: "task-1",
      }),
    ).rejects.toThrow(/unsupported image type/i);
    await expect(
      storage.importDroppedImageToAppData({
        attachmentId: "attachment-2",
        sourcePath: "C:\\Users\\Tester\\Pictures\\large.png",
        taskId: "task-1",
      }),
    ).rejects.toThrow(/larger than 10 mb/i);
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("rejects unsupported image extensions", async () => {
    const { runtime } = createRuntime({
      async stat() {
        return { isFile: true, size: 4 };
      },
    });
    const storage = createAttachmentFileStorage(runtime);

    await expect(
      storage.copyImageToAppData({
        attachmentId: "attachment-1",
        sourcePath: "C:\\Users\\Tester\\Pictures\\sample.gif",
        taskId: "task-1",
      }),
    ).rejects.toThrow(/unsupported image type/i);
  });

  it("rejects oversized image files before copying", async () => {
    const writeFile = vi.fn();
    const { runtime } = createRuntime({ writeFile });
    const storage = createAttachmentFileStorage(runtime);

    await expect(
      storage.copyImageToAppData({
        attachmentId: "attachment-1",
        sourcePath: "C:\\Users\\Tester\\Pictures\\large.png",
        taskId: "task-1",
      }),
    ).rejects.toThrow(/larger than 10 mb/i);
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("rejects missing selected files", async () => {
    const { runtime } = createRuntime();
    const storage = createAttachmentFileStorage(runtime);

    await expect(
      storage.copyImageToAppData({
        attachmentId: "attachment-1",
        sourcePath: "C:\\Users\\Tester\\Pictures\\missing.png",
        taskId: "task-1",
      }),
    ).rejects.toThrow(/unavailable/i);
  });

  it("resolves preview URLs from app-owned relative paths and reports missing files", async () => {
    const { runtime } = createRuntime();
    const storage = createAttachmentFileStorage(runtime);

    const copied = await storage.copyImageToAppData({
      attachmentId: "attachment-1",
      sourcePath: "C:\\Users\\Tester\\Pictures\\sample.png",
      taskId: "task-1",
    });

    await expect(storage.resolvePreview(copied.relativePath, copied.mimeType)).resolves.toEqual({
      missing: false,
      url: "blob:image/png:4",
    });
    await expect(storage.resolvePreview("attachments/images/task-1/missing.png", "image/png")).resolves.toEqual({
      missing: true,
      url: null,
    });
  });
});
