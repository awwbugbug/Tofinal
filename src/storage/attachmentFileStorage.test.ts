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
