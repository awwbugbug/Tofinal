import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import App from "@/app/App";
import { resetTaskRepositoryForTest, setTaskRepositoryForTest } from "@/repositories/taskRepository";
import type { AttachmentRepository } from "@/repositories/sqliteAttachmentRepository";
import type { TaskAppRepository } from "@/repositories/sqliteTaskAppRepository";
import type { AppLauncher } from "@/lib/appLauncher";
import { createSeedTasks } from "@/storage/taskStorage";
import type { AttachmentFileStorage } from "@/storage/attachmentFileStorage";
import type { ScreenshotCapture } from "@/storage/screenshotCapture";
import type { TaskAppSelection } from "@/storage/taskAppSelection";
import {
  resetAttachmentDependenciesForTest,
  setAttachmentDependenciesForTest,
} from "@/stores/attachmentStore";
import {
  resetTaskAppDependenciesForTest,
  setTaskAppDependenciesForTest,
} from "@/stores/taskAppStore";
import { PREFERENCES_STORAGE_KEY, resetPreferencesStore } from "@/stores/preferencesStore";
import { resetTaskStore } from "@/stores/taskStore";
import { createMemoryTaskRepository } from "@/test/taskRepositoryTestUtils";
import type { TaskAttachment } from "@/types/attachment";
import type { TaskApp } from "@/types/taskApp";

const createDeferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
};

const createAttachment = (overrides: Partial<TaskAttachment> = {}): TaskAttachment => ({
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

const createAttachmentRepository = (initialAttachments: TaskAttachment[] = []) => {
  const rows = [...initialAttachments];
  const repository: AttachmentRepository = {
    async listByTaskId(taskId) {
      return rows.filter((row) => row.taskId === taskId).sort((first, second) => first.sortOrder - second.sortOrder);
    },
    async getAttachment(id) {
      return rows.find((row) => row.id === id) ?? null;
    },
    async insertAttachment(attachment) {
      rows.push(attachment);
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

const createAttachmentFileStorage = (overrides: Partial<AttachmentFileStorage> = {}): AttachmentFileStorage => ({
  async pickImageFiles() {
    return ["C:\\Users\\Tester\\Pictures\\sample.png"];
  },
  async copyImageToAppData({ attachmentId, taskId }) {
    return {
      originalName: "sample.png",
      storedName: `${attachmentId}.png`,
      relativePath: `attachments/images/${taskId}/${attachmentId}.png`,
      mimeType: "image/png",
      sizeBytes: 4,
      width: null,
      height: null,
    };
  },
  async writeScreenshotToAppData({ attachmentId, taskId }) {
    return {
      originalName: "screenshot-20260612-173000.png",
      storedName: `${attachmentId}.png`,
      relativePath: `attachments/images/${taskId}/${attachmentId}.png`,
      mimeType: "image/png",
      sizeBytes: 12,
      width: 1920,
      height: 1080,
    };
  },
  async deleteAttachmentFile() {},
  async resolvePreview(relativePath, mimeType) {
    return { missing: false, url: `blob:${mimeType}:${relativePath}` };
  },
  createPreviewUrl(data, mimeType) {
    return `blob:${mimeType}:pending-${data.byteLength}`;
  },
  revokePreviewUrl: vi.fn(),
  ...overrides,
});

const createScreenshotCapture = (overrides: Partial<ScreenshotCapture> = {}): ScreenshotCapture => ({
  async captureFullscreen() {
    return {
      pngBytes: new Uint8Array([137, 80, 78, 71]),
      width: 1920,
      height: 1080,
    };
  },
  ...overrides,
});

const createTaskApp = (overrides: Partial<TaskApp> = {}): TaskApp => ({
  id: "task-app-1",
  taskId: "task-1",
  appName: "Notepad",
  appPath: "C:\\Windows\\notepad.exe",
  appKind: "exe",
  launchArgs: null,
  createdAt: "2026-06-11T08:10:00.000Z",
  updatedAt: "2026-06-11T08:10:00.000Z",
  sortOrder: 0,
  ...overrides,
});

const createTaskAppRepository = (initialApps: TaskApp[] = []) => {
  const rows = [...initialApps];
  const repository: TaskAppRepository = {
    async listByTaskId(taskId) {
      return rows.filter((row) => row.taskId === taskId).sort((first, second) => first.sortOrder - second.sortOrder);
    },
    async getTaskApp(id) {
      return rows.find((row) => row.id === id) ?? null;
    },
    async insertTaskApp(taskApp) {
      rows.push(taskApp);
    },
    async updateTaskApp(id, update) {
      rows.forEach((row) => {
        if (row.id === id) {
          row.appName = update.appName;
          row.updatedAt = update.updatedAt;
        }
      });
    },
    async deleteTaskApp(id) {
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

const createTaskAppSelection = (overrides: Partial<TaskAppSelection> = {}): TaskAppSelection => ({
  async pickAppPath() {
    return "C:\\Windows\\notepad.exe";
  },
  ...overrides,
});

const createAppLauncher = (overrides: Partial<AppLauncher> = {}): AppLauncher => ({
  async launch() {},
  ...overrides,
});

describe("App", () => {
  const renderApp = async () => {
    render(<App />);
    await screen.findByTestId("normal-mode-layout");
  };

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(
      PREFERENCES_STORAGE_KEY,
      JSON.stringify({ version: 1, theme: "system", language: "en-US" }),
    );
    vi.restoreAllMocks();
    resetTaskRepositoryForTest();
    setTaskRepositoryForTest(createMemoryTaskRepository({ tasks: createSeedTasks() }));
    resetAttachmentDependenciesForTest();
    setAttachmentDependenciesForTest({
      fileStorage: createAttachmentFileStorage(),
      repository: createAttachmentRepository().repository,
    });
    resetTaskAppDependenciesForTest();
    setTaskAppDependenciesForTest({
      launcher: createAppLauncher(),
      repository: createTaskAppRepository().repository,
      selection: createTaskAppSelection(),
    });
    resetPreferencesStore();
    resetTaskStore();
  });

  it("switches between normal window mode and desktop pin mode without losing task state", async () => {
    await renderApp();

    expect(screen.getByTestId("normal-mode-layout")).toBeInTheDocument();

    await userEvent.click(screen.getByLabelText(/mark finalize the first-stage desktop shell complete/i));
    await userEvent.click(screen.getByRole("button", { name: /desktop pin mode/i }));

    expect(screen.getByTestId("desktop-pin-layout")).toBeInTheDocument();
    expect(screen.queryByTestId("detail-panel")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /normal window mode/i }));

    expect(screen.getByTestId("normal-mode-layout")).toBeInTheDocument();
    expect(screen.getByText("3 open")).toBeInTheDocument();
  });

  it("adds a task through quick input with click and Enter, then clears the input", async () => {
    await renderApp();
    const input = screen.getByPlaceholderText(/add a task/i);

    await userEvent.click(screen.getByRole("button", { name: /add task/i }));
    expect(screen.getByText("4 open")).toBeInTheDocument();

    await userEvent.type(input, "Plan weekly review");
    await userEvent.click(screen.getByRole("button", { name: /add task/i }));

    expect(screen.getAllByText("Plan weekly review").length).toBeGreaterThan(0);
    expect(input).toHaveValue("");

    await userEvent.type(input, "Enter-created task{Enter}");

    expect(screen.getAllByText("Enter-created task").length).toBeGreaterThan(0);
    expect(screen.getByText("6 open")).toBeInTheDocument();
  });

  it("edits the selected task title, note, priority, tags, and pinned state", async () => {
    await renderApp();

    const detailPanel = within(screen.getByTestId("detail-panel"));
    const titleInput = detailPanel.getByLabelText(/task title/i);
    const noteInput = detailPanel.getByLabelText(/task note/i);

    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, "Polished local task shell");
    await userEvent.clear(noteInput);
    await userEvent.type(noteInput, "Editable local-only detail note");
    await userEvent.click(detailPanel.getByRole("button", { name: "Urgent" }));
    await userEvent.clear(detailPanel.getByLabelText(/task tags/i));
    await userEvent.type(detailPanel.getByLabelText(/task tags/i), "foundation, ui, foundation");
    await userEvent.click(detailPanel.getByLabelText(/pinned task/i));
    await userEvent.click(detailPanel.getByRole("button", { name: /save task/i }));

    expect(within(screen.getByTestId("task-list")).getByText("Polished local task shell")).toBeInTheDocument();
    expect(detailPanel.getByDisplayValue("Editable local-only detail note")).toBeInTheDocument();
    expect(detailPanel.getByText("foundation")).toBeInTheDocument();
    expect(detailPanel.getByText("ui")).toBeInTheDocument();
    expect(detailPanel.getByLabelText(/pinned task/i)).toBeChecked();
  });

  it("does not save an empty title", async () => {
    await renderApp();

    const detailPanel = within(screen.getByTestId("detail-panel"));
    await userEvent.clear(detailPanel.getByLabelText(/task title/i));
    await userEvent.click(detailPanel.getByRole("button", { name: /save task/i }));

    expect(detailPanel.getByText(/title is required/i)).toBeInTheDocument();
    expect(within(screen.getByTestId("task-list")).getByText("Finalize the first-stage desktop shell")).toBeInTheDocument();
  });

  it("shows saving status while a task update is being persisted", async () => {
    const saveRequest = createDeferred<void>();
    setTaskRepositoryForTest({
      async loadSnapshot() {
        return { tasks: createSeedTasks() };
      },
      async saveSnapshot() {
        return saveRequest.promise;
      },
    });
    resetTaskStore();
    await renderApp();

    const detailPanel = within(screen.getByTestId("detail-panel"));
    await userEvent.clear(detailPanel.getByLabelText(/task note/i));
    await userEvent.type(detailPanel.getByLabelText(/task note/i), "Persisting with status");
    await userEvent.click(detailPanel.getByRole("button", { name: /save task/i }));

    expect(detailPanel.getByRole("button", { name: /saving task/i })).toBeInTheDocument();
    expect(detailPanel.getByText(/saving locally/i)).toBeInTheDocument();

    saveRequest.resolve();

    await waitFor(() => {
      expect(detailPanel.getByText(/saved/i)).toBeInTheDocument();
    });
  });

  it("allows retrying a failed task save without changing the draft again", async () => {
    const savedSnapshots: Array<{ tasks: ReturnType<typeof createSeedTasks> }> = [];
    let failNextSave = true;
    setTaskRepositoryForTest({
      async loadSnapshot() {
        return { tasks: createSeedTasks() };
      },
      async saveSnapshot(snapshot) {
        if (failNextSave) {
          failNextSave = false;
          throw "database is locked";
        }
        savedSnapshots.push(snapshot);
      },
    });
    resetTaskStore();
    await renderApp();

    const detailPanel = within(screen.getByTestId("detail-panel"));
    await userEvent.clear(detailPanel.getByLabelText(/task note/i));
    await userEvent.type(detailPanel.getByLabelText(/task note/i), "Retry this saved note");
    await userEvent.click(detailPanel.getByRole("button", { name: /save task/i }));

    await waitFor(() => expect(detailPanel.getByText(/database is locked/i)).toBeInTheDocument());
    const retryButton = detailPanel.getByRole("button", { name: /save task/i });
    expect(retryButton).toBeEnabled();

    await userEvent.click(retryButton);

    await waitFor(() => expect(detailPanel.getByTitle(/^Saved /i)).toBeInTheDocument());
    expect(savedSnapshots[savedSnapshots.length - 1].tasks[0].note).toBe("Retry this saved note");
  });

  it("does not carry an unsaved draft into another selected task", async () => {
    await renderApp();

    const detailPanel = within(screen.getByTestId("detail-panel"));
    await userEvent.clear(detailPanel.getByLabelText(/task title/i));
    await userEvent.type(detailPanel.getByLabelText(/task title/i), "Unsaved first draft");
    await userEvent.click(screen.getByText("Sketch the desktop pin interaction"));
    await userEvent.clear(detailPanel.getByLabelText(/task note/i));
    await userEvent.type(detailPanel.getByLabelText(/task note/i), "Second task saved note");
    await userEvent.click(detailPanel.getByRole("button", { name: /save task/i }));

    expect(screen.queryByText("Unsaved first draft")).not.toBeInTheDocument();
    expect(detailPanel.getByDisplayValue("Sketch the desktop pin interaction")).toBeInTheDocument();
    expect(detailPanel.getByDisplayValue("Second task saved note")).toBeInTheDocument();
  });

  it("deletes the selected task after confirmation and updates the detail panel", async () => {
    await renderApp();

    const detailPanel = within(screen.getByTestId("detail-panel"));
    await userEvent.click(detailPanel.getByRole("button", { name: /delete task/i }));
    expect(screen.getByRole("dialog", { name: /delete this task/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /^delete$/i }));

    expect(screen.queryByText("Finalize the first-stage desktop shell")).not.toBeInTheDocument();
    expect(detailPanel.getByDisplayValue("Sketch the desktop pin interaction")).toBeInTheDocument();
    expect(screen.getByText("3 open")).toBeInTheDocument();
  });

  it("filters with real navigation including Pinned", async () => {
    await renderApp();
    const detailPanel = within(screen.getByTestId("detail-panel"));

    expect(screen.getByRole("button", { name: /today 4/i })).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(screen.getByRole("button", { name: /important 2/i }));
    expect(screen.queryByText("Sketch the desktop pin interaction")).not.toBeInTheDocument();
    expect(screen.getByText("Review lightweight state boundaries")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /all tasks 4/i }));
    await userEvent.click(detailPanel.getByLabelText(/pinned task/i));
    await userEvent.click(detailPanel.getByRole("button", { name: /save task/i }));
    await userEvent.click(screen.getByRole("button", { name: /pinned 1/i }));

    expect(screen.getByRole("button", { name: /pinned 1/i })).toHaveAttribute("aria-pressed", "true");
    expect(within(screen.getByTestId("task-list")).getByText("Finalize the first-stage desktop shell")).toBeInTheDocument();
    expect(screen.queryByText("Sketch the desktop pin interaction")).not.toBeInTheDocument();
  });

  it("searches by title and note and shows an empty state for no results", async () => {
    await renderApp();
    const searchInput = screen.getByLabelText(/search tasks/i);

    await userEvent.type(searchInput, "workerw");
    expect(within(screen.getByTestId("task-list")).getByText("Sketch the desktop pin interaction")).toBeInTheDocument();
    expect(screen.queryByText("Finalize the first-stage desktop shell")).not.toBeInTheDocument();

    await userEvent.clear(searchInput);
    await userEvent.type(searchInput, "no matching task");

    expect(screen.getByText(/no tasks match your search/i)).toBeInTheDocument();
  });

  it("renders the custom title bar controls", async () => {
    await renderApp();
    const titleBar = within(screen.getByTestId("window-title-bar"));

    expect(titleBar.getByText("ToFinal")).toBeInTheDocument();
    expect(titleBar.getByRole("button", { name: /minimize window/i })).toBeInTheDocument();
    expect(titleBar.getByRole("button", { name: /maximize or restore window/i })).toBeInTheDocument();
    expect(titleBar.getByRole("button", { name: /close window/i })).toBeInTheDocument();
  });

  it("opens preferences, persists theme and language, and updates visible labels", async () => {
    await renderApp();

    await userEvent.click(screen.getByRole("button", { name: /open preferences/i }));
    const dialog = screen.getByRole("dialog", { name: /preferences/i });

    expect(within(dialog).getByRole("button", { name: /system/i })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(within(dialog).getByRole("button", { name: /^dark$/i }));
    await userEvent.click(within(dialog).getByRole("button", { name: /^english$/i }));
    await userEvent.click(within(dialog).getByRole("checkbox", { name: /task completion celebration/i }));

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(JSON.parse(localStorage.getItem("tofinal.preferences.v1") ?? "{}")).toMatchObject({
      version: 2,
      theme: "dark",
      language: "en-US",
      completionCelebrationsEnabled: false,
    });
    expect(screen.getByPlaceholderText(/search tasks/i)).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole("button", { name: /^chinese$/i }));

    expect(screen.getByPlaceholderText("搜索任务")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /今天 4/i })).toBeInTheDocument();
    expect(screen.getAllByText("Finalize the first-stage desktop shell").length).toBeGreaterThan(0);
    expect(within(dialog).getByRole("button", { name: /^中文$/i })).toHaveAttribute("aria-pressed", "true");
  });

  it("resizes the three normal-mode panels within their width limits", async () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1120 });
    await renderApp();

    const layout = screen.getByTestId("normal-mode-layout");
    const leftHandle = screen.getByRole("separator", { name: /resize sidebar and task list/i });
    const rightHandle = screen.getByRole("separator", { name: /resize task list and detail panel/i });

    expect(layout).toHaveStyle({ gridTemplateColumns: "248px minmax(360px, 1fr) 340px" });
    expect(leftHandle).toHaveStyle({ left: "268px" });
    expect(rightHandle).toHaveStyle({ right: "360px" });

    fireEvent.pointerDown(leftHandle, { clientX: 248, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 328, pointerId: 1 });
    fireEvent.pointerUp(window, { pointerId: 1 });

    expect(layout).toHaveStyle({ gridTemplateColumns: "328px minmax(360px, 1fr) 340px" });
    expect(leftHandle).toHaveStyle({ left: "348px" });

    fireEvent.pointerDown(leftHandle, { clientX: 328, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 50, pointerId: 1 });
    fireEvent.pointerUp(window, { pointerId: 1 });

    expect(layout).toHaveStyle({ gridTemplateColumns: "220px minmax(360px, 1fr) 340px" });

    fireEvent.pointerDown(rightHandle, { clientX: 780, pointerId: 2 });
    fireEvent.pointerMove(window, { clientX: 720, pointerId: 2 });
    fireEvent.pointerUp(window, { pointerId: 2 });

    expect(layout).toHaveStyle({ gridTemplateColumns: "220px minmax(360px, 1fr) 400px" });
    expect(rightHandle).toHaveStyle({ right: "420px" });
  });

  it("reclamps resized panels when the window becomes narrower", async () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1600 });
    await renderApp();

    const layout = screen.getByTestId("normal-mode-layout");
    const leftHandle = screen.getByRole("separator", { name: /resize sidebar and task list/i });
    const rightHandle = screen.getByRole("separator", { name: /resize task list and detail panel/i });

    fireEvent.pointerDown(leftHandle, { clientX: 248, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 520, pointerId: 1 });
    fireEvent.pointerUp(window, { pointerId: 1 });

    fireEvent.pointerDown(rightHandle, { clientX: 1220, pointerId: 2 });
    fireEvent.pointerMove(window, { clientX: 940, pointerId: 2 });
    fireEvent.pointerUp(window, { pointerId: 2 });

    expect(layout).toHaveStyle({ gridTemplateColumns: "360px minmax(360px, 1fr) 480px" });

    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1120 });
    fireEvent.resize(window);

    expect(layout).toHaveStyle({ gridTemplateColumns: "360px minmax(360px, 1fr) 328px" });
    expect(leftHandle).toHaveStyle({ left: "380px" });
    expect(rightHandle).toHaveStyle({ right: "348px" });
  });

  it("does not render normal-mode resize handles in desktop pin mode", async () => {
    await renderApp();

    await userEvent.click(screen.getByRole("button", { name: /desktop pin mode/i }));

    expect(screen.getByTestId("desktop-pin-layout")).toBeInTheDocument();
    expect(screen.queryByRole("separator", { name: /resize sidebar and task list/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("separator", { name: /resize task list and detail panel/i })).not.toBeInTheDocument();
  });

  it("loads, adds, previews, and deletes image attachments in the selected task detail", async () => {
    const { repository, rows } = createAttachmentRepository([createAttachment()]);
    setAttachmentDependenciesForTest({ fileStorage: createAttachmentFileStorage(), repository });
    await renderApp();

    const detailPanel = within(screen.getByTestId("detail-panel"));
    expect(await detailPanel.findByText("sample.png")).toBeInTheDocument();
    const previewButton = detailPanel.getByRole("button", { name: /preview attachment sample\.png/i });
    expect(previewButton).toHaveClass("attachment-preview-trigger");
    expect(detailPanel.getByRole("img", { name: /sample\.png/i })).toHaveAttribute(
      "src",
      "blob:image/png:attachments/images/task-1/attachment-1.png",
    );

    await userEvent.click(detailPanel.getByRole("button", { name: /add image attachment/i }));
    await waitFor(() => expect(rows).toHaveLength(2));
    expect(detailPanel.getAllByText("sample.png")).toHaveLength(2);

    await userEvent.click(detailPanel.getAllByRole("button", { name: /delete attachment/i })[0]);
    await waitFor(() => expect(rows).toHaveLength(1));
    expect(rows.some((row) => row.id === "attachment-1")).toBe(false);
  });

  it("opens the screenshot editor, confirms a full screenshot, and reuses the existing lightbox", async () => {
    const { repository, rows } = createAttachmentRepository();
    setAttachmentDependenciesForTest({
      fileStorage: createAttachmentFileStorage(),
      repository,
      screenshotCapture: createScreenshotCapture(),
    });
    await renderApp();

    const detailPanel = within(screen.getByTestId("detail-panel"));
    expect(detailPanel.queryByText(/full screenshot/i)).not.toBeInTheDocument();
    await userEvent.click(detailPanel.getByRole("button", { name: /^screenshot$/i }));

    const editor = await screen.findByRole("dialog", { name: /screenshot editor/i });
    expect(within(editor).getByRole("img", { name: /captured screenshot preview/i })).toHaveAttribute(
      "src",
      "blob:image/png:pending-4",
    );
    expect(rows).toHaveLength(0);

    await userEvent.click(within(editor).getByRole("button", { name: /^confirm$/i }));
    await waitFor(() => expect(rows).toHaveLength(1));
    expect(rows[0]).toMatchObject({
      kind: "screenshot",
      mimeType: "image/png",
      originalName: expect.stringMatching(/^screenshot-\d{8}-\d{6}\.png$/),
    });
    expect(await detailPanel.findByText(rows[0].originalName)).toBeInTheDocument();

    await userEvent.click(detailPanel.getByRole("button", { name: new RegExp(`preview attachment ${rows[0].originalName}`, "i") }));
    expect(screen.getByRole("dialog", { name: new RegExp(`image preview ${rows[0].originalName}`, "i") })).toBeInTheDocument();
  });

  it("cancels screenshot editor with Escape without writing metadata", async () => {
    const { repository, rows } = createAttachmentRepository();
    setAttachmentDependenciesForTest({
      fileStorage: createAttachmentFileStorage(),
      repository,
      screenshotCapture: createScreenshotCapture(),
    });
    await renderApp();

    const detailPanel = within(screen.getByTestId("detail-panel"));
    await userEvent.click(detailPanel.getByRole("button", { name: /^screenshot$/i }));
    expect(await screen.findByRole("dialog", { name: /screenshot editor/i })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => expect(screen.queryByRole("dialog", { name: /screenshot editor/i })).not.toBeInTheDocument());
    expect(rows).toHaveLength(0);
  });

  it("keeps attachment and app action buttons responsive in a narrow detail panel", async () => {
    await renderApp();

    const detailPanel = within(screen.getByTestId("detail-panel"));
    const addImageButton = detailPanel.getByRole("button", { name: /add image attachment/i });
    const addScreenshotButton = detailPanel.getByRole("button", { name: /^screenshot$/i });
    const addAppButton = detailPanel.getByRole("button", { name: /add app/i });
    const startTaskButton = detailPanel.getByRole("button", { name: /start task/i });

    expect(addImageButton).toBeInTheDocument();
    expect(addScreenshotButton).toBeInTheDocument();
    expect(detailPanel.queryByText(/full screenshot/i)).not.toBeInTheDocument();
    expect(detailPanel.getAllByRole("button", { name: /screenshot/i })).toHaveLength(1);
    expect(addAppButton).toBeInTheDocument();
    expect(startTaskButton).toBeInTheDocument();

    expect(addImageButton.parentElement).toHaveClass("detail-action-buttons");
    expect(addScreenshotButton.parentElement).toHaveClass("detail-action-buttons");
    expect(addAppButton.parentElement).toHaveClass("detail-action-buttons");
    expect(startTaskButton.parentElement).toHaveClass("detail-action-buttons");
    expect(addImageButton.parentElement).toHaveClass("detail-action-buttons-grid");
    expect(addAppButton.parentElement).toHaveClass("detail-action-buttons-grid");
  });

  it("shows screenshot capture errors without changing existing attachments", async () => {
    const { repository, rows } = createAttachmentRepository();
    setAttachmentDependenciesForTest({
      fileStorage: createAttachmentFileStorage(),
      repository,
      screenshotCapture: createScreenshotCapture({
        async captureFullscreen() {
          throw new Error("Screenshot unavailable");
        },
      }),
    });
    await renderApp();

    const detailPanel = within(screen.getByTestId("detail-panel"));
    await userEvent.click(detailPanel.getByRole("button", { name: /^screenshot$/i }));

    await waitFor(() => expect(detailPanel.getByText(/screenshot unavailable/i)).toBeInTheDocument());
    expect(rows).toHaveLength(0);
  });

  it("opens image attachments in a lightbox and closes with button, backdrop, and Escape", async () => {
    const { repository } = createAttachmentRepository([createAttachment()]);
    setAttachmentDependenciesForTest({ fileStorage: createAttachmentFileStorage(), repository });
    await renderApp();

    const detailPanel = within(screen.getByTestId("detail-panel"));
    await userEvent.click(await detailPanel.findByRole("button", { name: /preview attachment sample\.png/i }));

    const lightbox = screen.getByRole("dialog", { name: /image preview sample\.png/i });
    expect(within(lightbox).getByRole("img", { name: /sample\.png/i })).toHaveAttribute(
      "src",
      "blob:image/png:attachments/images/task-1/attachment-1.png",
    );

    await userEvent.click(within(lightbox).getByRole("button", { name: /close image preview/i }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /image preview/i })).not.toBeInTheDocument());

    await userEvent.click(detailPanel.getByRole("button", { name: /preview attachment sample\.png/i }));
    await userEvent.click(screen.getByTestId("attachment-lightbox-backdrop"));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /image preview/i })).not.toBeInTheDocument());

    await userEvent.click(detailPanel.getByRole("button", { name: /preview attachment sample\.png/i }));
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /image preview/i })).not.toBeInTheDocument());
  });

  it("shows a broken lightbox image state without breaking attachment deletion", async () => {
    const { repository, rows } = createAttachmentRepository([createAttachment()]);
    setAttachmentDependenciesForTest({ fileStorage: createAttachmentFileStorage(), repository });
    await renderApp();

    const detailPanel = within(screen.getByTestId("detail-panel"));
    await userEvent.click(await detailPanel.findByRole("button", { name: /preview attachment sample\.png/i }));

    const lightbox = screen.getByRole("dialog", { name: /image preview sample\.png/i });
    fireEvent.error(within(lightbox).getByRole("img", { name: /sample\.png/i }));
    expect(within(lightbox).getByText(/unable to preview image/i)).toBeInTheDocument();

    await userEvent.click(within(lightbox).getByRole("button", { name: /close image preview/i }));
    await userEvent.click(detailPanel.getByRole("button", { name: /delete attachment sample\.png/i }));

    await waitFor(() => expect(rows).toHaveLength(0));
  });

  it("does not let stale attachment loads from a previous selected task replace the current task attachments", async () => {
    let resolveFirst!: (value: TaskAttachment[]) => void;
    const firstLoad = new Promise<TaskAttachment[]>((resolve) => {
      resolveFirst = resolve;
    });
    const repository: AttachmentRepository = {
      listByTaskId: vi
        .fn()
        .mockReturnValueOnce(firstLoad)
        .mockResolvedValueOnce([createAttachment({ id: "task-2-attachment", taskId: "task-2", originalName: "second.png" })]),
      async getAttachment() {
        return null;
      },
      async insertAttachment() {},
      async deleteAttachment() {},
      async deleteByTaskId() {},
    };
    setAttachmentDependenciesForTest({ fileStorage: createAttachmentFileStorage(), repository });
    await renderApp();

    await userEvent.click(screen.getByText("Sketch the desktop pin interaction"));
    resolveFirst([createAttachment({ originalName: "stale.png" })]);

    const detailPanel = within(screen.getByTestId("detail-panel"));
    await waitFor(() => expect(detailPanel.getByText("second.png")).toBeInTheDocument());
    expect(detailPanel.queryByText("stale.png")).not.toBeInTheDocument();
  });

  it("cleans attachment files when deleting a task and leaves desktop pin mode unchanged", async () => {
    const deleteAttachmentFile = vi.fn();
    const { repository, rows } = createAttachmentRepository([createAttachment()]);
    setAttachmentDependenciesForTest({
      fileStorage: createAttachmentFileStorage({ deleteAttachmentFile }),
      repository,
    });
    await renderApp();

    const detailPanel = within(screen.getByTestId("detail-panel"));
    await userEvent.click(detailPanel.getByRole("button", { name: /delete task/i }));
    await userEvent.click(screen.getByRole("button", { name: /^delete$/i }));

    await waitFor(() => expect(rows).toHaveLength(0));
    expect(deleteAttachmentFile).toHaveBeenCalledWith("attachments/images/task-1/attachment-1.png");

    await userEvent.click(screen.getByRole("button", { name: /desktop pin mode/i }));
    expect(screen.getByTestId("desktop-pin-layout")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /add image attachment/i })).not.toBeInTheDocument();
  });

  it("loads, adds, edits, starts, and deletes task app bindings in the selected task detail", async () => {
    const launch = vi.fn();
    const { repository, rows } = createTaskAppRepository([createTaskApp()]);
    setTaskAppDependenciesForTest({
      launcher: createAppLauncher({ launch }),
      repository,
      selection: createTaskAppSelection({ async pickAppPath() { return "C:\\Tools\\Editor.lnk"; } }),
    });
    await renderApp();

    const detailPanel = within(screen.getByTestId("detail-panel"));
    expect(await detailPanel.findByDisplayValue("Notepad")).toBeInTheDocument();
    expect(detailPanel.getByText(/c:\\windows\\notepad\.exe/i)).toBeInTheDocument();

    await userEvent.click(detailPanel.getByRole("button", { name: /start task/i }));
    await waitFor(() => expect(launch).toHaveBeenCalledWith(createTaskApp()));
    expect(detailPanel.getByText(/started locally/i)).toBeInTheDocument();

    const appNameInput = detailPanel.getByLabelText(/app name notepad/i);
    await userEvent.clear(appNameInput);
    await userEvent.type(appNameInput, "Notes");
    fireEvent.blur(appNameInput);
    await waitFor(() => expect(rows[0].appName).toBe("Notes"));

    await userEvent.click(detailPanel.getByRole("button", { name: /add app/i }));
    await waitFor(() => expect(rows).toHaveLength(2));
    expect(rows[1]).toMatchObject({ appKind: "shortcut", appName: "Editor" });

    await userEvent.click(detailPanel.getByRole("button", { name: /delete app notes/i }));
    await waitFor(() => expect(rows.some((row) => row.id === "task-app-1")).toBe(false));
  });

  it("shows task app launch errors and does not render app bindings in desktop pin mode", async () => {
    const { repository } = createTaskAppRepository([createTaskApp()]);
    setTaskAppDependenciesForTest({
      launcher: createAppLauncher({
        async launch() {
          throw new Error("App path does not exist.");
        },
      }),
      repository,
      selection: createTaskAppSelection(),
    });
    await renderApp();

    const detailPanel = within(screen.getByTestId("detail-panel"));
    expect(await detailPanel.findByDisplayValue("Notepad")).toBeInTheDocument();

    await userEvent.click(detailPanel.getByRole("button", { name: /start task/i }));
    await waitFor(() => expect(detailPanel.getAllByText(/app path does not exist/i).length).toBeGreaterThan(0));
    expect(detailPanel.getByText(/missing/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /desktop pin mode/i }));
    expect(screen.getByTestId("desktop-pin-layout")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /start task/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /add app/i })).not.toBeInTheDocument();
  });
});
