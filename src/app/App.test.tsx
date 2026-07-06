import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const windowModeMocks = vi.hoisted(() => ({
  applyWindowMode: vi.fn(async () => undefined),
}));

vi.mock("@/lib/windowMode", () => ({
  applyWindowMode: windowModeMocks.applyWindowMode,
}));

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
import { getLocalDateKey, resetTaskStore } from "@/stores/taskStore";
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
  async importDroppedImageToAppData({ attachmentId, taskId }) {
    return {
      originalName: "dropped.png",
      storedName: `${attachmentId}.png`,
      relativePath: `attachments/images/${taskId}/${attachmentId}.png`,
      mimeType: "image/png",
      sizeBytes: 8,
      width: null,
      height: null,
    };
  },
  async writePastedImageToAppData({ attachmentId, bytes, mimeType, originalName, taskId }) {
    return {
      originalName,
      storedName: `${attachmentId}.png`,
      relativePath: `attachments/images/${taskId}/${attachmentId}.png`,
      mimeType,
      sizeBytes: bytes.byteLength,
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
    windowModeMocks.applyWindowMode.mockClear();
  });

  it("switches to the original single-window Desktop Pin Mode and back", async () => {
    await renderApp();

    expect(screen.getByTestId("normal-mode-layout")).toBeInTheDocument();

    await userEvent.click(screen.getByLabelText(/mark finalize the first-stage desktop shell complete/i));
    const pinModeButton = within(screen.getByTestId("normal-mode-layout")).getByRole("button", {
      name: /switch to desktop pin mode/i,
    });
    expect(pinModeButton.textContent?.trim()).toBe("");
    expect(pinModeButton.querySelector(".lucide-pin")).not.toBeInTheDocument();
    expect(pinModeButton.querySelector(".lucide-panel-top-open")).toBeInTheDocument();
    expect(within(screen.getByTestId("normal-mode-layout")).queryByText("Normal Window Mode")).not.toBeInTheDocument();

    await userEvent.click(pinModeButton);

    const pinLayoutElement = await screen.findByTestId("desktop-pin-layout");
    expect(pinLayoutElement).toBeInTheDocument();
    expect(within(pinLayoutElement).getByTestId("desktop-pin-shell")).not.toHaveClass("max-w-[360px]");
    expect(screen.queryByTestId("normal-mode-layout")).not.toBeInTheDocument();
    expect(screen.queryByTestId("detail-panel")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /add image attachment/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /start task/i })).not.toBeInTheDocument();
    expect(screen.getByText("3 open tasks")).toBeInTheDocument();
    await waitFor(() => expect(windowModeMocks.applyWindowMode).toHaveBeenCalledWith("pin"));

    const normalModeButton = within(pinLayoutElement).getByRole("button", { name: /normal window mode/i });
    expect(normalModeButton.textContent?.trim()).toBe("");
    await userEvent.click(normalModeButton);

    expect(await screen.findByTestId("normal-mode-layout")).toBeInTheDocument();
    expect(screen.queryByTestId("desktop-pin-layout")).not.toBeInTheDocument();
    await waitFor(() => expect(windowModeMocks.applyWindowMode).toHaveBeenCalledWith("normal"));
  });

  it("quick-adds and completes tasks inside Desktop Pin Mode", async () => {
    await renderApp();
    await userEvent.click(screen.getByRole("button", { name: /switch to desktop pin mode/i }));
    const pinLayout = within(await screen.findByTestId("desktop-pin-layout"));

    expect(pinLayout.getByText("4 open tasks")).toBeInTheDocument();
    await userEvent.type(pinLayout.getByRole("textbox", { name: /add task/i }), "Widget capture{Enter}");

    expect(pinLayout.getByText("Widget capture")).toBeInTheDocument();
    expect(pinLayout.getByText("5 open tasks")).toBeInTheDocument();

    await userEvent.click(pinLayout.getByLabelText(/mark widget capture complete/i));

    await waitFor(() => expect(pinLayout.getByText("4 open tasks")).toBeInTheDocument());
    await waitFor(() => expect(pinLayout.queryByText("Widget capture")).not.toBeInTheDocument(), { timeout: 1500 });
  });

  it("applies theme and language preferences inside Desktop Pin Mode", async () => {
    localStorage.setItem(
      PREFERENCES_STORAGE_KEY,
      JSON.stringify({ version: 2, theme: "dark", language: "en-US", completionCelebrationsEnabled: true }),
    );

    await renderApp();
    await userEvent.click(screen.getByRole("button", { name: /desktop pin mode/i }));

    expect(document.documentElement.dataset.theme).toBe("dark");
    const pinLayout = within(await screen.findByTestId("desktop-pin-layout"));

    expect(pinLayout.getByText("Desktop Pin Mode")).toBeInTheDocument();
    expect(pinLayout.getByRole("button", { name: "Open Normal Window Mode" })).toBeInTheDocument();
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

  it("separates Today execution tasks from All Tasks backlog and future tasks", async () => {
    const today = getLocalDateKey();
    const tasks = createSeedTasks().map((task, index) => {
      if (index === 0) {
        return { ...task, title: "Planned today", plannedDate: today, completed: false, completedAt: null };
      }
      if (index === 1) {
        return { ...task, title: "Backlog task", plannedDate: null, completed: false, completedAt: null };
      }
      if (index === 2) {
        return { ...task, title: "Future task", plannedDate: "2099-01-01", completed: false, completedAt: null };
      }

      return { ...task, title: "Completed today", plannedDate: today, completed: true, completedAt: `${today}T09:00:00.000Z` };
    });
    const repository = createMemoryTaskRepository({ tasks });
    setTaskRepositoryForTest(repository);
    resetTaskStore();

    await renderApp();

    expect(within(screen.getByTestId("task-list")).getByText("Planned today")).toBeInTheDocument();
    expect(screen.queryByText("Backlog task")).not.toBeInTheDocument();
    expect(screen.queryByText("Future task")).not.toBeInTheDocument();
    const completedTodaySection = screen.getByRole("region", { name: /completed today/i });
    expect(completedTodaySection).toBeInTheDocument();
    expect(within(screen.getByTestId("today-completed-task-list")).getByText("Completed today")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /all tasks 4/i }));

    expect(within(screen.getByTestId("task-list")).getByText("Planned today")).toBeInTheDocument();
    expect(within(screen.getByTestId("task-list")).getByText("Backlog task")).toBeInTheDocument();
    expect(within(screen.getByTestId("task-list")).getByText("Future task")).toBeInTheDocument();
    expect(within(screen.getByTestId("task-list")).getByText("Completed today")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: /completed today/i })).not.toBeInTheDocument();
  });

  it("renders expanded stacks with drag affordances and opens child tasks in detail", async () => {
    const seedTasks = createSeedTasks();
    const stack = {
      id: "stack-visible",
      sortOrder: 0,
      collapsed: false,
      createdAt: seedTasks[0].createdAt,
      updatedAt: seedTasks[0].updatedAt,
    };
    const tasks = [
      { ...seedTasks[0], id: "task-main", title: "Visible main task", stackId: stack.id, stackOrder: 0 },
      { ...seedTasks[1], id: "task-child", title: "Visible child task", note: "Child note should not open detail", stackId: stack.id, stackOrder: 1 },
      { ...seedTasks[2], id: "task-singleton", stackId: "stack-singleton", stackOrder: 0 },
    ];
    setTaskRepositoryForTest(createMemoryTaskRepository({
      tasks,
      stacks: [
        stack,
        {
          id: "stack-singleton",
          sortOrder: 1,
          collapsed: true,
          createdAt: seedTasks[2].createdAt,
          updatedAt: seedTasks[2].updatedAt,
        },
      ],
    }));
    resetTaskStore();

    await renderApp();
    await userEvent.click(screen.getByRole("button", { name: /all tasks/i }));

    const expandedStack = screen.getByTestId("task-stack-expanded");
    expect(expandedStack).toHaveAttribute("data-dnd-stack-frame", "true");
    expect(expandedStack.querySelector(".task-stack-main-frame")).toBeInTheDocument();
    expect(expandedStack.querySelector(".task-stack-unfold-panel")).toBeInTheDocument();
    expect(expandedStack.querySelectorAll("[data-dnd-task-frame='true']")).toHaveLength(2);

    await userEvent.click(within(expandedStack).getByText("Visible child task"));

    const detailPanel = within(screen.getByTestId("detail-panel"));
    expect(detailPanel.getByDisplayValue("Visible child task")).toBeInTheDocument();
    expect(detailPanel.queryByDisplayValue("Visible main task")).not.toBeInTheDocument();
  });

  it("presents collapsed multi-task stacks as layered cards that open from the stack body", async () => {
    const seedTasks = createSeedTasks();
    const stack = {
      id: "stack-layered",
      sortOrder: 0,
      collapsed: true,
      createdAt: seedTasks[0].createdAt,
      updatedAt: seedTasks[0].updatedAt,
    };
    const tasks = [
      { ...seedTasks[0], id: "layered-main", title: "Layered main task", stackId: stack.id, stackOrder: 0 },
      { ...seedTasks[1], id: "layered-child", title: "Layered child task", stackId: stack.id, stackOrder: 1 },
    ];
    setTaskRepositoryForTest(createMemoryTaskRepository({ tasks, stacks: [stack] }));
    resetTaskStore();

    await renderApp();
    await userEvent.click(screen.getByRole("button", { name: /all tasks/i }));

    const collapsedStack = screen.getByRole("button", { name: /expand stack/i });
    expect(collapsedStack).toHaveClass("task-stack-collapsed-multi");
    expect(within(collapsedStack).getByTestId("task-stack-count")).toHaveTextContent("2");
    expect(screen.queryByText("Expand stack")).not.toBeInTheDocument();

    await userEvent.click(within(collapsedStack).getByText("Layered main task"));

    expect(screen.queryByTestId("task-stack-expanded")).not.toBeInTheDocument();
    expect(within(screen.getByTestId("detail-panel")).getByDisplayValue("Layered main task")).toBeInTheDocument();

    await userEvent.dblClick(collapsedStack);

    const expandedStack = await screen.findByTestId("task-stack-expanded");
    expect(within(expandedStack).getByText("Layered main task")).toBeInTheDocument();
    expect(within(expandedStack).getByText("Layered child task")).toBeInTheDocument();
    expect(expandedStack.querySelector(".task-stack-unfold-control-row")).not.toBeInTheDocument();

    // Collapse plays the fold animation first, then commits the state switch.
    await userEvent.dblClick(expandedStack.querySelector(".task-stack-main-frame") as HTMLElement);
    expect(expandedStack).toHaveClass("task-stack-collapsing");

    await waitFor(() => expect(screen.queryByTestId("task-stack-expanded")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: /expand stack/i })).toHaveClass("task-stack-collapsed-multi");
  });

  it("keeps completion controls interactive without accidentally expanding collapsed stacks", async () => {
    const seedTasks = createSeedTasks();
    const stack = {
      id: "stack-checkbox",
      sortOrder: 0,
      collapsed: true,
      createdAt: seedTasks[0].createdAt,
      updatedAt: seedTasks[0].updatedAt,
    };
    const tasks = [
      { ...seedTasks[0], id: "checkbox-main", title: "Checkbox main task", plannedDate: null, stackId: stack.id, stackOrder: 0 },
      { ...seedTasks[1], id: "checkbox-child", title: "Checkbox child task", plannedDate: null, stackId: stack.id, stackOrder: 1 },
    ];
    setTaskRepositoryForTest(createMemoryTaskRepository({ tasks, stacks: [stack] }));
    resetTaskStore();

    await renderApp();
    await userEvent.click(screen.getByRole("button", { name: /all tasks/i }));

    await userEvent.click(screen.getByRole("checkbox", { name: /mark checkbox main task complete/i }));

    expect(screen.queryByTestId("task-stack-expanded")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /expand stack/i })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /mark checkbox main task incomplete/i })).toBeInTheDocument();
  });

  it("keeps completed non-today tasks in All while Today only shows them while completed today", async () => {
    const today = getLocalDateKey();
    const tasks = createSeedTasks().map((task, index) => {
      if (index === 0) {
        return { ...task, title: "Today execution task", plannedDate: today, completed: false, completedAt: null };
      }
      if (index === 1) {
        return { ...task, title: "Backlog completion task", plannedDate: null, completed: false, completedAt: null };
      }
      return { ...task, plannedDate: "2099-01-01", completed: false, completedAt: null };
    });
    setTaskRepositoryForTest(createMemoryTaskRepository({ tasks }));
    resetTaskStore();

    await renderApp();
    await userEvent.click(screen.getByRole("button", { name: /all tasks 4/i }));
    await userEvent.click(screen.getByRole("checkbox", { name: /mark backlog completion task complete/i }));

    expect(within(screen.getByTestId("task-list")).getByText("Backlog completion task")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /mark backlog completion task incomplete/i })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /today \d/i }));
    expect(within(screen.getByTestId("today-completed-task-list")).getByText("Backlog completion task")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("checkbox", { name: /mark backlog completion task incomplete/i }));
    await waitFor(() => {
      expect(screen.queryByTestId("today-completed-task-list")).not.toBeInTheDocument();
    });
    expect(within(screen.getByTestId("task-list")).queryByText("Backlog completion task")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /all tasks 4/i }));
    expect(within(screen.getByTestId("task-list")).getByText("Backlog completion task")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /mark backlog completion task complete/i })).toBeInTheDocument();
  });
  it("keeps completed tasks visible in Important and Pinned attribute views", async () => {
    const today = getLocalDateKey();
    const tasks = createSeedTasks().map((task, index) => {
      if (index === 0) {
        return { ...task, title: "Completed important task", priority: "important" as const, pinned: false, plannedDate: today, completed: true, completedAt: `${today}T09:00:00.000Z` };
      }
      if (index === 1) {
        return { ...task, title: "Completed pinned task", priority: "normal" as const, pinned: true, plannedDate: null, completed: true, completedAt: `${today}T10:00:00.000Z` };
      }
      return { ...task, priority: "normal" as const, pinned: false, completed: false, completedAt: null };
    });
    setTaskRepositoryForTest(createMemoryTaskRepository({ tasks }));
    resetTaskStore();

    await renderApp();
    await userEvent.click(screen.getByRole("button", { name: /important 1/i }));
    expect(within(screen.getByTestId("task-list")).getByText("Completed important task")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /mark completed important task incomplete/i })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /pinned 1/i }));
    expect(within(screen.getByTestId("task-list")).getByText("Completed pinned task")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /mark completed pinned task incomplete/i })).toBeInTheDocument();
  });
  it("uses view-specific plannedDate defaults when quick-adding tasks", async () => {
    const today = getLocalDateKey();
    const repository = createMemoryTaskRepository({ tasks: createSeedTasks() });
    setTaskRepositoryForTest(repository);
    resetTaskStore();
    await renderApp();

    await userEvent.type(screen.getByPlaceholderText(/add a task/i), "Today planned task{Enter}");
    await waitFor(() => expect(repository.savedSnapshots.length).toBeGreaterThan(0));
    expect(repository.savedSnapshots[repository.savedSnapshots.length - 1].tasks[0]).toMatchObject({
      title: "Today planned task",
      plannedDate: today,
    });

    await userEvent.click(screen.getByRole("button", { name: /all tasks/i }));
    await userEvent.type(screen.getByPlaceholderText(/add a task/i), "Backlog default task{Enter}");
    await waitFor(() => expect(repository.savedSnapshots[repository.savedSnapshots.length - 1].tasks[0].title).toBe("Backlog default task"));
    expect(repository.savedSnapshots[repository.savedSnapshots.length - 1].tasks[0].plannedDate).toBeNull();
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
    await userEvent.click(detailPanel.getByRole("button", { name: /pin task/i }));
    await userEvent.click(detailPanel.getByRole("button", { name: /save task/i }));

    expect(within(screen.getByTestId("task-list")).getByText("Polished local task shell")).toBeInTheDocument();
    expect(detailPanel.getByDisplayValue("Editable local-only detail note")).toBeInTheDocument();
    expect(detailPanel.getByText("foundation")).toBeInTheDocument();
    expect(detailPanel.getByText("ui")).toBeInTheDocument();
    expect(detailPanel.getByRole("button", { name: /unpin task/i })).toHaveAttribute("aria-pressed", "true");
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
    expect(detailPanel.getByTestId("task-save-status")).toHaveTextContent(/saving locally/i);
    expect(detailPanel.getByTestId("task-action-row")).toContainElement(
      detailPanel.getByRole("button", { name: /delete task/i }),
    );
    expect(detailPanel.getByTestId("task-action-row")).toContainElement(
      detailPanel.getByRole("button", { name: /saving task/i }),
    );
    expect(detailPanel.getByRole("button", { name: /delete task/i })).toHaveClass("danger-glass-button");

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

  it("navigates and completes tasks with keyboard shortcuts", async () => {
    await renderApp();
    const detailPanel = within(screen.getByTestId("detail-panel"));
    expect(detailPanel.getByDisplayValue("Finalize the first-stage desktop shell")).toBeInTheDocument();

    // ArrowDown moves selection to the next card.
    await userEvent.keyboard("{ArrowDown}");
    expect(detailPanel.getByDisplayValue("Sketch the desktop pin interaction")).toBeInTheDocument();
    await userEvent.keyboard("{ArrowUp}");
    expect(detailPanel.getByDisplayValue("Finalize the first-stage desktop shell")).toBeInTheDocument();

    // Space completes the selected task (exit animation delays the commit).
    await userEvent.keyboard(" ");
    await waitFor(() =>
      expect(within(screen.getByTestId("task-list")).queryByText("Finalize the first-stage desktop shell")).not.toBeInTheDocument(),
    );

    // Ctrl+2 switches to All Tasks.
    await userEvent.keyboard("{Control>}2{/Control}");
    expect(screen.getByRole("button", { name: /all tasks/i })).toHaveAttribute("aria-pressed", "true");

    // Shortcuts stay inert while typing in an input.
    await userEvent.click(screen.getByLabelText(/search tasks/i));
    await userEvent.keyboard("abc def");
    expect(screen.getByLabelText(/search tasks/i)).toHaveValue("abc def");

    // Escape clears the search.
    await userEvent.keyboard("{Escape}");
    expect(screen.getByLabelText(/search tasks/i)).toHaveValue("");
  });

  it("browses another date in the date view and plans quick-added tasks to it", async () => {
    await renderApp();

    await userEvent.click(screen.getByRole("button", { name: /next day/i }));

    // Title switches to Tomorrow; today's tasks leave the list.
    expect(screen.getByRole("heading", { name: /tomorrow/i })).toBeInTheDocument();
    expect(screen.queryByText("Finalize the first-stage desktop shell")).not.toBeInTheDocument();

    // Quick add plans the new task to the selected date.
    await userEvent.type(screen.getByPlaceholderText(/add a task/i), "Future thing{Enter}");
    expect(within(screen.getByTestId("task-list")).getByText("Future thing")).toBeInTheDocument();

    // The sidebar date item now labels the selected date instead of Today.
    expect(screen.queryByRole("button", { name: /^today \d/i })).not.toBeInTheDocument();

    // Back to today restores the original view.
    await userEvent.click(screen.getByRole("button", { name: /back to today/i }));
    expect(within(screen.getByTestId("task-list")).getByText("Finalize the first-stage desktop shell")).toBeInTheDocument();
    expect(screen.queryByText("Future thing")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^today \d/i })).toBeInTheDocument();
  });

  it("plans the selected task for tomorrow from the detail date chips", async () => {
    await renderApp();

    const detailPanel = within(screen.getByTestId("detail-panel"));
    await userEvent.click(detailPanel.getByRole("button", { name: /^tomorrow$/i }));

    // The task immediately leaves Today and shows a planned label in All.
    expect(within(screen.getByTestId("task-list")).queryByText("Finalize the first-stage desktop shell")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /all tasks/i }));
    const allList = within(screen.getByTestId("task-list"));
    expect(allList.getByText("Finalize the first-stage desktop shell")).toBeInTheDocument();
    expect(allList.getByTestId("task-planned-label")).toHaveTextContent(/tomorrow/i);

    // Clearing sends it back to the unscheduled pool without a planned label.
    await userEvent.click(allList.getByText("Finalize the first-stage desktop shell"));
    await userEvent.click(detailPanel.getByRole("button", { name: /^clear$/i }));
    expect(allList.queryByTestId("task-planned-label")).not.toBeInTheDocument();
  });

  it("shows overdue tasks in a Today section and moves them all to today", async () => {
    const seedTasks = createSeedTasks();
    const tasks = [
      { ...seedTasks[0], id: "task-overdue", title: "Yesterday leftover", plannedDate: "2020-01-01", stackId: "stack-task-overdue" },
      ...seedTasks.slice(1),
    ];
    setTaskRepositoryForTest(createMemoryTaskRepository({ tasks }));
    resetTaskStore();

    await renderApp();

    // Overdue section renders the stale task with an overdue-days label.
    const overdueList = within(screen.getByTestId("overdue-task-list"));
    expect(overdueList.getByText("Yesterday leftover")).toBeInTheDocument();
    expect(overdueList.getByTestId("task-overdue-label")).toBeInTheDocument();
    expect(within(screen.getByTestId("task-list")).queryByText("Yesterday leftover")).not.toBeInTheDocument();

    // The Today count includes the overdue task (3 planned today + 1 overdue).
    expect(screen.getByRole("button", { name: /today 4/i })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /move all to today/i }));

    expect(screen.queryByTestId("overdue-section")).not.toBeInTheDocument();
    expect(within(screen.getByTestId("task-list")).getByText("Yesterday leftover")).toBeInTheDocument();
  });

  it("moves the deleted task to trash immediately, supports undo, and restores from the trash panel", async () => {
    await renderApp();

    const detailPanel = within(screen.getByTestId("detail-panel"));
    await userEvent.click(detailPanel.getByRole("button", { name: /delete task/i }));

    // No confirm dialog; the undo toast appears once the exit animation commits.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await screen.findByTestId("undo-toast");
    expect(within(screen.getByTestId("task-list")).queryByText("Finalize the first-stage desktop shell")).not.toBeInTheDocument();
    expect(detailPanel.getByDisplayValue("Sketch the desktop pin interaction")).toBeInTheDocument();
    expect(screen.getByText("3 open")).toBeInTheDocument();

    // Undo restores the task.
    await userEvent.click(within(screen.getByTestId("undo-toast")).getByRole("button", { name: /undo/i }));
    expect(within(screen.getByTestId("task-list")).getByText("Finalize the first-stage desktop shell")).toBeInTheDocument();
    expect(screen.getByText("4 open")).toBeInTheDocument();

    // Delete again and restore through the trash panel instead.
    await userEvent.click(detailPanel.getByRole("button", { name: /delete task/i }));
    await screen.findByTestId("undo-toast");
    await userEvent.click(screen.getByRole("button", { name: /open trash/i }));

    const trashPanel = within(screen.getByRole("dialog", { name: /trash/i }));
    expect(trashPanel.getByText("Finalize the first-stage desktop shell")).toBeInTheDocument();
    await userEvent.click(trashPanel.getByRole("button", { name: /restore finalize/i }));

    await userEvent.click(screen.getByRole("button", { name: /close trash/i }));
    expect(within(screen.getByTestId("task-list")).getByText("Finalize the first-stage desktop shell")).toBeInTheDocument();
  });

  it("filters with real navigation including Pinned", async () => {
    await renderApp();
    const detailPanel = within(screen.getByTestId("detail-panel"));

    expect(screen.getByRole("button", { name: /today 4/i })).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(screen.getByRole("button", { name: /important 2/i }));
    expect(screen.queryByText("Sketch the desktop pin interaction")).not.toBeInTheDocument();
    expect(screen.getByText("Review lightweight state boundaries")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /all tasks 4/i }));
    await userEvent.click(detailPanel.getByRole("button", { name: /pin task/i }));
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
    expect(titleBar.getByRole("button", { name: /minimize window/i })).toHaveClass("glass-icon-button");
    expect(titleBar.getByRole("button", { name: /minimize window/i })).toHaveClass("glass-icon-button-safe");
    expect(titleBar.getByRole("button", { name: /maximize or restore window/i })).toHaveClass("glass-icon-button");
    expect(titleBar.getByRole("button", { name: /maximize or restore window/i })).toHaveClass("glass-icon-button-safe");
    expect(titleBar.getByRole("button", { name: /close window/i })).toHaveClass("glass-icon-button");
    expect(titleBar.getByRole("button", { name: /close window/i })).toHaveClass("glass-icon-button-safe");
  });

  it("opens preferences, persists theme and language, and updates visible labels", async () => {
    await renderApp();

    await userEvent.click(screen.getByRole("button", { name: /open preferences/i }));
    const dialog = screen.getByRole("dialog", { name: /preferences/i });
    expect(within(dialog).getAllByRole("button", { name: /^close$/i })[0]).toHaveClass("glass-icon-button");
    expect(within(dialog).getAllByRole("button", { name: /^close$/i })[0]).toHaveClass("glass-icon-button-safe");

    expect(within(dialog).getByRole("button", { name: /system/i })).toHaveAttribute("aria-pressed", "true");
    expect(within(dialog).getAllByRole("button", { name: /^close$/i })).toHaveLength(1);
    expect(within(dialog).getByRole("button", { name: /soft glass standard/i })).toHaveAttribute("aria-pressed", "true");
    expect(within(dialog).getByRole("button", { name: /button glass standard/i })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(within(dialog).getByRole("button", { name: /^dark$/i }));
    await userEvent.click(within(dialog).getByRole("button", { name: /^english$/i }));
    await userEvent.click(within(dialog).getByRole("checkbox", { name: /task completion celebration/i }));
    await userEvent.click(within(dialog).getByRole("button", { name: /soft glass subtle/i }));
    await userEvent.click(within(dialog).getByRole("button", { name: /button glass strong/i }));

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.dataset.softGlass).toBe("subtle");
    expect(document.documentElement.dataset.highlightGlass).toBe("strong");
    expect(JSON.parse(localStorage.getItem("tofinal.preferences.v1") ?? "{}")).toMatchObject({
      version: 3,
      theme: "dark",
      language: "en-US",
      completionCelebrationsEnabled: false,
      softGlassLevel: "subtle",
      highlightGlassLevel: "strong",
    });
    expect(screen.getByPlaceholderText(/search tasks/i)).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole("button", { name: /^chinese$/i }));

    expect(screen.getByPlaceholderText("搜索任务")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /今天 4/i })).toBeInTheDocument();
    expect(screen.getAllByText("Finalize the first-stage desktop shell").length).toBeGreaterThan(0);
    expect(within(dialog).getByRole("button", { name: /^中文$/i })).toHaveAttribute("aria-pressed", "true");
  });

  it("uses soft glass for selected embedded controls and highlight glass for action buttons", async () => {
    await renderApp();

    expect(document.querySelector(".filter-nav-thumb")).toHaveClass("glass-soft");
    expect(screen.getByRole("button", { name: /add task/i })).toHaveClass("glass-highlight");

    const detailPanel = within(screen.getByTestId("detail-panel"));
    expect(document.querySelector(".priority-segment-thumb")).toHaveClass("glass-soft");
    expect(detailPanel.getByRole("button", { name: /pin task/i })).toHaveClass("glass-soft");
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

    // Detail clamps to its 360px minimum first, then the sidebar absorbs the rest.
    expect(layout).toHaveStyle({ gridTemplateColumns: "328px minmax(360px, 1fr) 360px" });
    expect(leftHandle).toHaveStyle({ left: "348px" });
    expect(rightHandle).toHaveStyle({ right: "380px" });
  });

  it("does not render normal-mode resize handles in desktop pin mode", async () => {
    await renderApp();
    await userEvent.click(screen.getByRole("button", { name: /desktop pin mode/i }));
    expect(await screen.findByTestId("desktop-pin-layout")).toBeInTheDocument();

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
    expect(within(lightbox).getByRole("button", { name: /close image preview/i })).toHaveClass("glass-icon-button");
    expect(within(lightbox).getByRole("button", { name: /close image preview/i })).toHaveClass("glass-icon-button-safe");

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

  it("keeps attachment files while a task sits in trash and cleans them on purge", async () => {
    const deleteAttachmentFile = vi.fn();
    const { repository, rows } = createAttachmentRepository([createAttachment()]);
    setAttachmentDependenciesForTest({
      fileStorage: createAttachmentFileStorage({ deleteAttachmentFile }),
      repository,
    });
    await renderApp();

    const detailPanel = within(screen.getByTestId("detail-panel"));
    await userEvent.click(detailPanel.getByRole("button", { name: /delete task/i }));
    await screen.findByTestId("undo-toast");

    // Trash keeps metadata and files.
    expect(rows).toHaveLength(1);
    expect(deleteAttachmentFile).not.toHaveBeenCalled();

    // Purging from the trash panel removes both.
    await userEvent.click(screen.getByRole("button", { name: /open trash/i }));
    const trashPanel = within(screen.getByRole("dialog", { name: /trash/i }));
    await userEvent.click(trashPanel.getByRole("button", { name: /delete forever/i }));

    await waitFor(() => expect(rows).toHaveLength(0));
    expect(deleteAttachmentFile).toHaveBeenCalledWith("attachments/images/task-1/attachment-1.png");

    await userEvent.click(screen.getByRole("button", { name: /close trash/i }));
    await userEvent.click(screen.getByRole("button", { name: /desktop pin mode/i }));
    expect(await screen.findByTestId("desktop-pin-layout")).toBeInTheDocument();
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
    expect(await screen.findByTestId("desktop-pin-layout")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /start task/i })).not.toBeInTheDocument();
  });
});



