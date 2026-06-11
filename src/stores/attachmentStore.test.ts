import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AttachmentRepository } from "@/repositories/sqliteAttachmentRepository";
import {
  createAttachmentStore,
  resetAttachmentDependenciesForTest,
  setAttachmentDependenciesForTest,
} from "@/stores/attachmentStore";
import type { AttachmentFileStorage } from "@/storage/attachmentFileStorage";
import type { TaskAttachment } from "@/types/attachment";

const attachment = (overrides: Partial<TaskAttachment> = {}): TaskAttachment => ({
  id: "attachment-1",
  taskId: "task-1",
  kind: "image",
  originalName: "sample.png",
  storedName: "attachment-1.png",
  relativePath: "attachments/images/task-1/attachment-1.png",
  mimeType: "image/png",
  sizeBytes: 4,
  width: null,
  height: null,
  createdAt: "2026-06-11T00:00:00.000Z",
  updatedAt: "2026-06-11T00:00:00.000Z",
  sortOrder: 0,
  ...overrides,
});

const createRepository = (initialAttachments: TaskAttachment[] = []) => {
  const rows = [...initialAttachments];
  const repository: AttachmentRepository = {
    async listByTaskId(taskId) {
      return rows.filter((row) => row.taskId === taskId).sort((first, second) => first.sortOrder - second.sortOrder);
    },
    async getAttachment(id) {
      return rows.find((row) => row.id === id) ?? null;
    },
    async insertAttachment(nextAttachment) {
      rows.push(nextAttachment);
    },
    async deleteAttachment(id) {
      const index = rows.findIndex((row) => row.id === id);
      if (index >= 0) {
        rows.splice(index, 1);
      }
    },
    async deleteByTaskId(taskId) {
      let index = rows.length - 1;
      while (index >= 0) {
        if (rows[index].taskId === taskId) {
          rows.splice(index, 1);
        }
        index -= 1;
      }
    },
  };

  return { repository, rows };
};

const createFileStorage = (overrides: Partial<AttachmentFileStorage> = {}): AttachmentFileStorage => ({
  async pickImageFiles() {
    return ["C:\\Users\\Tester\\Pictures\\sample.png"];
  },
  async copyImageToAppData() {
    return {
      originalName: "sample.png",
      storedName: "attachment-generated.png",
      relativePath: "attachments/images/task-1/attachment-generated.png",
      mimeType: "image/png",
      sizeBytes: 4,
      width: null,
      height: null,
    };
  },
  async deleteAttachmentFile() {},
  async resolvePreview(relativePath, mimeType) {
    return { missing: false, url: `blob:${mimeType}:${relativePath}` };
  },
  ...overrides,
});

describe("attachment store", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetAttachmentDependenciesForTest();
  });

  it("loads attachments by task id with preview state", async () => {
    const { repository } = createRepository([attachment()]);
    const store = createAttachmentStore();
    setAttachmentDependenciesForTest({ fileStorage: createFileStorage(), repository });

    await store.getState().loadByTaskId("task-1");

    expect(store.getState().itemsByTaskId["task-1"]).toMatchObject([
      {
        id: "attachment-1",
        previewUrl: "blob:image/png:attachments/images/task-1/attachment-1.png",
        missing: false,
      },
    ]);
  });

  it("adds selected image metadata after copying into app data", async () => {
    const { repository, rows } = createRepository();
    const store = createAttachmentStore();
    setAttachmentDependenciesForTest({ fileStorage: createFileStorage(), repository });

    await store.getState().addImageAttachment("task-1");

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: "image",
      originalName: "sample.png",
      relativePath: "attachments/images/task-1/attachment-generated.png",
      taskId: "task-1",
    });
    expect(store.getState().itemsByTaskId["task-1"]).toHaveLength(1);
  });

  it("cleans copied files when metadata insert fails", async () => {
    const deleteAttachmentFile = vi.fn();
    const { repository } = createRepository();
    repository.insertAttachment = async () => {
      throw new Error("metadata failed");
    };
    const store = createAttachmentStore();
    setAttachmentDependenciesForTest({
      fileStorage: createFileStorage({ deleteAttachmentFile }),
      repository,
    });

    await store.getState().addImageAttachment("task-1");

    expect(deleteAttachmentFile).toHaveBeenCalledWith("attachments/images/task-1/attachment-generated.png");
    expect(store.getState().error).toBe("metadata failed");
  });

  it("deletes metadata first and does not restore it when file deletion fails", async () => {
    const { repository, rows } = createRepository([attachment()]);
    const store = createAttachmentStore();
    setAttachmentDependenciesForTest({
      fileStorage: createFileStorage({
        async deleteAttachmentFile() {
          throw new Error("file cleanup failed");
        },
      }),
      repository,
    });
    await store.getState().loadByTaskId("task-1");

    await store.getState().deleteAttachment("attachment-1");

    expect(rows).toHaveLength(0);
    expect(store.getState().itemsByTaskId["task-1"]).toEqual([]);
    expect(store.getState().error).toMatch(/file cleanup failed/i);
  });

  it("ignores stale attachment loads for the same selected task", async () => {
    let resolveFirst!: (value: TaskAttachment[]) => void;
    const firstLoad = new Promise<TaskAttachment[]>((resolve) => {
      resolveFirst = resolve;
    });
    const repository: AttachmentRepository = {
      listByTaskId: vi
        .fn()
        .mockReturnValueOnce(firstLoad)
        .mockResolvedValueOnce([attachment({ id: "newer" })]),
      async getAttachment() {
        return null;
      },
      async insertAttachment() {},
      async deleteAttachment() {},
      async deleteByTaskId() {},
    };
    const store = createAttachmentStore();
    setAttachmentDependenciesForTest({ fileStorage: createFileStorage(), repository });

    const stale = store.getState().loadByTaskId("task-1");
    await store.getState().loadByTaskId("task-1");
    resolveFirst([attachment({ id: "stale" })]);
    await stale;

    expect(store.getState().itemsByTaskId["task-1"].map((item) => item.id)).toEqual(["newer"]);
  });

  it("cleans files after a task delete without making task deletion depend on file cleanup", async () => {
    const deleteTask = vi.fn();
    const deleteAttachmentFile = vi.fn().mockRejectedValue(new Error("file cleanup failed"));
    const { repository, rows } = createRepository([attachment(), attachment({ id: "attachment-2" })]);
    const store = createAttachmentStore();
    setAttachmentDependenciesForTest({
      fileStorage: createFileStorage({ deleteAttachmentFile }),
      repository,
    });

    await store.getState().deleteTaskWithAttachmentCleanup("task-1", deleteTask);

    expect(deleteTask).toHaveBeenCalledWith("task-1");
    expect(rows).toHaveLength(0);
    expect(deleteAttachmentFile).toHaveBeenCalledTimes(2);
    expect(store.getState().error).toMatch(/file cleanup failed/i);
  });
});
