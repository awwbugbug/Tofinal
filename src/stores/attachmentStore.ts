import { create, type StateCreator, type StoreApi, type UseBoundStore } from "zustand";
import { createStore } from "zustand/vanilla";

import {
  sqliteAttachmentRepository,
  type AttachmentRepository,
} from "@/repositories/sqliteAttachmentRepository";
import {
  tauriAttachmentFileStorage,
  type AttachmentFileStorage,
  type AttachmentPreview,
} from "@/storage/attachmentFileStorage";
import {
  tauriScreenshotCapture,
  type ScreenshotCapture,
} from "@/storage/screenshotCapture";
import type { TaskAttachment } from "@/types/attachment";

export type AttachmentView = TaskAttachment & AttachmentPreview & {
  previewUrl: string | null;
};

export type PendingScreenshot = {
  taskId: string;
  pngBytes: Uint8Array;
  previewUrl: string;
  width: number;
  height: number;
};

export type FinalScreenshot = {
  pngBytes: Uint8Array;
  width: number;
  height: number;
};

type AttachmentState = {
  itemsByTaskId: Record<string, AttachmentView[]>;
  loadingTaskIds: Record<string, boolean>;
  adding: boolean;
  capturing: boolean;
  screenshotEditing: boolean;
  pendingScreenshot: PendingScreenshot | null;
  deletingIds: Record<string, boolean>;
  error: string | null;
};

type AttachmentActions = {
  loadByTaskId: (taskId: string) => Promise<void>;
  addImageAttachment: (taskId: string) => Promise<void>;
  addScreenshotAttachment: (taskId: string) => Promise<void>;
  confirmScreenshotAttachment: (screenshot: FinalScreenshot) => Promise<void>;
  cancelScreenshotAttachment: () => void;
  deleteAttachment: (attachmentId: string) => Promise<void>;
  deleteTaskWithAttachmentCleanup: (taskId: string, deleteTask: (taskId: string) => void) => Promise<void>;
};

export type AttachmentStore = AttachmentState & AttachmentActions;

type AttachmentDependencies = {
  repository: AttachmentRepository;
  fileStorage: AttachmentFileStorage;
  screenshotCapture: ScreenshotCapture;
};

let dependencies: AttachmentDependencies = {
  repository: sqliteAttachmentRepository,
  fileStorage: tauriAttachmentFileStorage,
  screenshotCapture: tauriScreenshotCapture,
};

const initialState = (): AttachmentState => ({
  itemsByTaskId: {},
  loadingTaskIds: {},
  adding: false,
  capturing: false,
  screenshotEditing: false,
  pendingScreenshot: null,
  deletingIds: {},
  error: null,
});

const nowIso = () => new Date().toISOString();

const screenshotOriginalName = () => {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");

  return `screenshot-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(
    date.getHours(),
  )}${pad(date.getMinutes())}${pad(date.getSeconds())}.png`;
};

const errorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message;
  }

  return "Attachment operation failed.";
};

const withPreview = async (
  attachment: TaskAttachment,
  fileStorage: AttachmentFileStorage,
): Promise<AttachmentView> => {
  try {
    const preview = await fileStorage.resolvePreview(attachment.relativePath, attachment.mimeType);
    return { ...attachment, ...preview, previewUrl: preview.url };
  } catch {
    return { ...attachment, missing: true, previewUrl: null, url: null };
  }
};

const createAttachmentStoreState: StateCreator<AttachmentStore> = (set, get) => {
  const latestLoadRequestByTaskId = new Map<string, number>();
  let latestLoadRequest = 0;

  const loadAndSetByTaskId = async (taskId: string) => {
    const requestId = latestLoadRequest + 1;
    latestLoadRequest = requestId;
    latestLoadRequestByTaskId.set(taskId, requestId);
    set((state) => ({
      loadingTaskIds: { ...state.loadingTaskIds, [taskId]: true },
      error: null,
    }));

    try {
      const attachments = await dependencies.repository.listByTaskId(taskId);
      const views = await Promise.all(
        attachments.map((attachment) => withPreview(attachment, dependencies.fileStorage)),
      );

      if (latestLoadRequestByTaskId.get(taskId) !== requestId) {
        return;
      }

      set((state) => ({
        itemsByTaskId: { ...state.itemsByTaskId, [taskId]: views },
        loadingTaskIds: { ...state.loadingTaskIds, [taskId]: false },
        error: null,
      }));
    } catch (error) {
      if (latestLoadRequestByTaskId.get(taskId) !== requestId) {
        return;
      }

      set((state) => ({
        loadingTaskIds: { ...state.loadingTaskIds, [taskId]: false },
        error: errorMessage(error),
      }));
    }
  };

  return {
    ...initialState(),
    loadByTaskId: loadAndSetByTaskId,
    addImageAttachment: async (taskId) => {
      set({ adding: true, error: null });

      try {
        const selectedFiles = await dependencies.fileStorage.pickImageFiles();
        if (selectedFiles.length === 0) {
          set({ adding: false });
          return;
        }

        const existingAttachments = await dependencies.repository.listByTaskId(taskId);
        let nextSortOrder =
          existingAttachments.reduce((maxSortOrder, attachment) => Math.max(maxSortOrder, attachment.sortOrder), -1) + 1;

        for (const sourcePath of selectedFiles) {
          const attachmentId = `attachment-${crypto.randomUUID()}`;
          const copied = await dependencies.fileStorage.copyImageToAppData({
            attachmentId,
            sourcePath,
            taskId,
          });
          const timestamp = nowIso();
          const attachment: TaskAttachment = {
            id: attachmentId,
            taskId,
            kind: "image",
            originalName: copied.originalName,
            storedName: copied.storedName,
            relativePath: copied.relativePath,
            mimeType: copied.mimeType,
            sizeBytes: copied.sizeBytes,
            width: copied.width,
            height: copied.height,
            createdAt: timestamp,
            updatedAt: timestamp,
            sortOrder: nextSortOrder,
          };

          try {
            await dependencies.repository.insertAttachment(attachment);
          } catch (error) {
            await Promise.resolve(dependencies.fileStorage.deleteAttachmentFile(copied.relativePath)).catch(
              () => undefined,
            );
            throw error;
          }

          nextSortOrder += 1;
        }

        await loadAndSetByTaskId(taskId);
        set({ adding: false, error: null });
      } catch (error) {
        set({ adding: false, error: errorMessage(error) });
      }
    },
    addScreenshotAttachment: async (taskId) => {
      set({ capturing: true, error: null });

      try {
        const screenshot = await dependencies.screenshotCapture.captureFullscreen();
        if (!screenshot.width || !screenshot.height || screenshot.width <= 0 || screenshot.height <= 0) {
          throw new Error("Screenshot capture returned invalid dimensions.");
        }

        const previewUrl = dependencies.fileStorage.createPreviewUrl(screenshot.pngBytes, "image/png");
        set({
          capturing: false,
          screenshotEditing: true,
          pendingScreenshot: {
            taskId,
            pngBytes: screenshot.pngBytes,
            previewUrl,
            width: screenshot.width,
            height: screenshot.height,
          },
          error: null,
        });
      } catch (error) {
        set({ capturing: false, screenshotEditing: false, pendingScreenshot: null, error: errorMessage(error) });
      }
    },
    confirmScreenshotAttachment: async (screenshot) => {
      const pendingScreenshot = get().pendingScreenshot;
      if (!pendingScreenshot) {
        return;
      }

      set({ capturing: true, error: null });

      try {
        const taskId = pendingScreenshot.taskId;
        const existingAttachments = await dependencies.repository.listByTaskId(taskId);
        const sortOrder =
          existingAttachments.reduce((maxSortOrder, attachment) => Math.max(maxSortOrder, attachment.sortOrder), -1) + 1;
        const attachmentId = `attachment-${crypto.randomUUID()}`;
        const copied = await dependencies.fileStorage.writeScreenshotToAppData({
          attachmentId,
          height: screenshot.height,
          originalName: screenshotOriginalName(),
          pngBytes: screenshot.pngBytes,
          taskId,
          width: screenshot.width,
        });
        const timestamp = nowIso();
        const attachment: TaskAttachment = {
          id: attachmentId,
          taskId,
          kind: "screenshot",
          originalName: copied.originalName,
          storedName: copied.storedName,
          relativePath: copied.relativePath,
          mimeType: copied.mimeType,
          sizeBytes: copied.sizeBytes,
          width: copied.width,
          height: copied.height,
          createdAt: timestamp,
          updatedAt: timestamp,
          sortOrder,
        };

        try {
          await dependencies.repository.insertAttachment(attachment);
        } catch (error) {
          await Promise.resolve(dependencies.fileStorage.deleteAttachmentFile(copied.relativePath)).catch(
            () => undefined,
          );
          throw error;
        }

        await loadAndSetByTaskId(taskId);
        dependencies.fileStorage.revokePreviewUrl(pendingScreenshot.previewUrl);
        set({ capturing: false, screenshotEditing: false, pendingScreenshot: null, error: null });
      } catch (error) {
        set({ capturing: false, error: errorMessage(error) });
      }
    },
    cancelScreenshotAttachment: () => {
      const pendingScreenshot = get().pendingScreenshot;
      if (pendingScreenshot) {
        dependencies.fileStorage.revokePreviewUrl(pendingScreenshot.previewUrl);
      }

      set({ capturing: false, screenshotEditing: false, pendingScreenshot: null, error: null });
    },
    deleteAttachment: async (attachmentId) => {
      const item = Object.values(get().itemsByTaskId)
        .flat()
        .find((attachment) => attachment.id === attachmentId);
      const persistedItem = item ?? (await dependencies.repository.getAttachment(attachmentId));
      if (!persistedItem) {
        return;
      }

      set((state) => ({
        deletingIds: { ...state.deletingIds, [attachmentId]: true },
        error: null,
      }));

      try {
        await dependencies.repository.deleteAttachment(attachmentId);
        set((state) => ({
          itemsByTaskId: {
            ...state.itemsByTaskId,
            [persistedItem.taskId]: (state.itemsByTaskId[persistedItem.taskId] ?? []).filter(
              (attachment) => attachment.id !== attachmentId,
            ),
          },
        }));

        try {
          await dependencies.fileStorage.deleteAttachmentFile(persistedItem.relativePath);
          set({ error: null });
        } catch (error) {
          set({ error: errorMessage(error) });
        }
      } catch (error) {
        set({ error: errorMessage(error) });
      } finally {
        set((state) => {
          const { [attachmentId]: _removed, ...nextDeletingIds } = state.deletingIds;
          return { deletingIds: nextDeletingIds };
        });
      }
    },
    deleteTaskWithAttachmentCleanup: async (taskId, deleteTask) => {
      let attachments: TaskAttachment[] = [];
      try {
        attachments = await dependencies.repository.listByTaskId(taskId);
      } catch (error) {
        set({ error: errorMessage(error) });
      }

      deleteTask(taskId);
      set((state) => {
        const { [taskId]: _removed, ...nextItemsByTaskId } = state.itemsByTaskId;
        return { itemsByTaskId: nextItemsByTaskId };
      });

      try {
        await dependencies.repository.deleteByTaskId(taskId);
      } catch (error) {
        set({ error: errorMessage(error) });
      }

      const cleanupResults = await Promise.allSettled(
        attachments.map((attachment) => dependencies.fileStorage.deleteAttachmentFile(attachment.relativePath)),
      );
      const cleanupFailure = cleanupResults.find((result) => result.status === "rejected");

      if (cleanupFailure?.status === "rejected") {
        set({ error: errorMessage(cleanupFailure.reason) });
      }
    },
  };
};

export const createAttachmentStore = () => createStore<AttachmentStore>()(createAttachmentStoreState);

export const useAttachmentStore: UseBoundStore<StoreApi<AttachmentStore>> =
  create<AttachmentStore>()(createAttachmentStoreState);

export const setAttachmentDependenciesForTest = (nextDependencies: Partial<AttachmentDependencies>) => {
  dependencies = { ...dependencies, ...nextDependencies };
};

export const resetAttachmentDependenciesForTest = () => {
  dependencies = {
    repository: sqliteAttachmentRepository,
    fileStorage: tauriAttachmentFileStorage,
    screenshotCapture: tauriScreenshotCapture,
  };
  useAttachmentStore.setState(initialState());
};
