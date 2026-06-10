import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import App from "@/app/App";
import { resetTaskStore } from "@/stores/taskStore";

describe("App", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    resetTaskStore();
  });

  it("switches between normal window mode and desktop pin mode without losing task state", async () => {
    render(<App />);

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
    render(<App />);
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
    render(<App />);

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
    render(<App />);

    const detailPanel = within(screen.getByTestId("detail-panel"));
    await userEvent.clear(detailPanel.getByLabelText(/task title/i));
    await userEvent.click(detailPanel.getByRole("button", { name: /save task/i }));

    expect(detailPanel.getByText(/title is required/i)).toBeInTheDocument();
    expect(within(screen.getByTestId("task-list")).getByText("Finalize the first-stage desktop shell")).toBeInTheDocument();
  });

  it("deletes the selected task after confirmation and updates the detail panel", async () => {
    render(<App />);

    const detailPanel = within(screen.getByTestId("detail-panel"));
    await userEvent.click(detailPanel.getByRole("button", { name: /delete task/i }));
    expect(screen.getByRole("dialog", { name: /delete this task/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /^delete$/i }));

    expect(screen.queryByText("Finalize the first-stage desktop shell")).not.toBeInTheDocument();
    expect(detailPanel.getByDisplayValue("Sketch the desktop pin interaction")).toBeInTheDocument();
    expect(screen.getByText("3 open")).toBeInTheDocument();
  });

  it("filters with real navigation including Pinned", async () => {
    render(<App />);
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
    render(<App />);
    const searchInput = screen.getByLabelText(/search tasks/i);

    await userEvent.type(searchInput, "workerw");
    expect(within(screen.getByTestId("task-list")).getByText("Sketch the desktop pin interaction")).toBeInTheDocument();
    expect(screen.queryByText("Finalize the first-stage desktop shell")).not.toBeInTheDocument();

    await userEvent.clear(searchInput);
    await userEvent.type(searchInput, "no matching task");

    expect(screen.getByText(/no tasks match your search/i)).toBeInTheDocument();
  });

  it("renders the custom title bar controls", () => {
    render(<App />);
    const titleBar = within(screen.getByTestId("window-title-bar"));

    expect(titleBar.getByText("ToFinal")).toBeInTheDocument();
    expect(titleBar.getByRole("button", { name: /minimize window/i })).toBeInTheDocument();
    expect(titleBar.getByRole("button", { name: /maximize or restore window/i })).toBeInTheDocument();
    expect(titleBar.getByRole("button", { name: /close window/i })).toBeInTheDocument();
  });

  it("resizes the three normal-mode panels within their width limits", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1120 });
    render(<App />);

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

  it("reclamps resized panels when the window becomes narrower", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1600 });
    render(<App />);

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
    render(<App />);

    await userEvent.click(screen.getByRole("button", { name: /desktop pin mode/i }));

    expect(screen.getByTestId("desktop-pin-layout")).toBeInTheDocument();
    expect(screen.queryByRole("separator", { name: /resize sidebar and task list/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("separator", { name: /resize task list and detail panel/i })).not.toBeInTheDocument();
  });
});
