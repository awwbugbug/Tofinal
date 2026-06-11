import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import App from "@/app/App";
import { resetTaskRepositoryForTest, setTaskRepositoryForTest } from "@/repositories/taskRepository";
import type { AttachmentRepository } from "@/repositories/sqliteAttachmentRepository";
import { createSeedTasks } from "@/storage/taskStorage";
import type { AttachmentFileStorage } from "@/storage/attachmentFileStorage";
import {
  resetAttachmentDependenciesForTest,
  setAttachmentDependenciesForTest,
} from "@/stores/attachmentStore";
import { resetTaskStore } from "@/stores/taskStore";
import { createMemoryTaskRepository } from "@/test/taskRepositoryTestUtils";
import type { TaskAttachment } from "@/types/attachment";

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
  async deleteAttachmentFile() {},
  async resolvePreview(relativePath, mimeType) {
    return { missing: false, url: `blob:${mimeType}:${relativePath}` };
  },
  ...overrides,
});

describe("App", () => {
  const renderApp = async () => {
    render(<App />);
    await screen.findByTestId("normal-mode-layout");
  };

  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    resetTaskRepositoryForTest();
    setTaskRepositoryForTest(createMemoryTaskRepository({ tasks: createSeedTasks() }));
    resetAttachmentDependenciesForTest();
    setAttachmentDependenciesForTest({
      fileStorage: createAttachmentFileStorage(),
      repository: createAttachmentRepository().repository,
    });
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
});
