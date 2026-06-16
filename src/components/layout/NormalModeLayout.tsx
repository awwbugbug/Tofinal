import { type PointerEvent as ReactPointerEvent, useEffect, useState } from "react";
import { MonitorUp, Pin, Search } from "lucide-react";

import { Sidebar } from "@/components/layout/Sidebar";
import { DetailPanel } from "@/components/layout/DetailPanel";
import { QuickInput } from "@/components/task/QuickInput";
import { TaskList } from "@/components/task/TaskList";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AttachmentView, FinalScreenshot, PendingScreenshot } from "@/stores/attachmentStore";
import type { TaskAppView } from "@/stores/taskAppStore";
import type { Task, TaskFilter } from "@/types/task";

type NormalModeLayoutProps = {
  tasks: Task[];
  filteredTasks: Task[];
  selectedTask: Task | null;
  attachments: AttachmentView[];
  attachmentsLoading: boolean;
  attachmentsAdding: boolean;
  attachmentsCapturing: boolean;
  screenshotEditing: boolean;
  pendingScreenshot: PendingScreenshot | null;
  attachmentDeletingIds: Record<string, boolean>;
  attachmentError: string | null;
  taskApps: TaskAppView[];
  taskAppsLoading: boolean;
  taskAppsAdding: boolean;
  taskAppsLaunching: boolean;
  taskAppError: string | null;
  lastTaskAppsStartedAt: string | null;
  selectedTaskId: string | null;
  activeFilter: TaskFilter;
  searchQuery: string;
  saving: boolean;
  lastSavedAt: string | null;
  persistenceError: string | null;
  onAddTask: (title: string) => void;
  onAddImageAttachment: (taskId: string) => void;
  onAddScreenshotAttachment: (taskId: string) => void;
  onConfirmScreenshotAttachment: (screenshot: FinalScreenshot) => void;
  onCancelScreenshotAttachment: () => void;
  onDeleteAttachment: (attachmentId: string) => void;
  onAddTaskApp: (taskId: string) => void;
  onDeleteTaskApp: (appId: string) => void;
  onStartTaskApps: (taskId: string) => void;
  onUpdateTaskAppName: (appId: string, appName: string) => void;
  onRetryPersistTasks: () => void;
  onDeleteTask: (id: string) => void;
  onFilterChange: (filter: TaskFilter) => void;
  onSearchChange: (query: string) => void;
  onSelectTask: (id: string) => void;
  onToggleTask: (id: string) => void;
  onUpdateTask: (
    id: string,
    update: Partial<Pick<Task, "title" | "note" | "priority" | "tags" | "pinned">>,
  ) => boolean;
  onSwitchToPin: () => void;
};

const DEFAULT_SIDEBAR_WIDTH = 248;
const DEFAULT_DETAIL_WIDTH = 340;
const SIDEBAR_MIN_WIDTH = 220;
const SIDEBAR_MAX_WIDTH = 360;
const DETAIL_MIN_WIDTH = 300;
const DETAIL_MAX_WIDTH = 480;
const TASK_LIST_MIN_WIDTH = 360;
const LAYOUT_HORIZONTAL_PADDING = 40;
const LAYOUT_TOTAL_GAP = 32;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const getAvailableColumnWidth = () =>
  Math.max(0, (window.innerWidth || 0) - LAYOUT_HORIZONTAL_PADDING - LAYOUT_TOTAL_GAP);

const normalizePanelWidths = (sidebarWidth: number, detailWidth: number) => {
  let nextSidebarWidth = clamp(sidebarWidth, SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH);
  let nextDetailWidth = clamp(detailWidth, DETAIL_MIN_WIDTH, DETAIL_MAX_WIDTH);
  const maxOuterColumnsWidth = getAvailableColumnWidth() - TASK_LIST_MIN_WIDTH;

  if (maxOuterColumnsWidth < SIDEBAR_MIN_WIDTH + DETAIL_MIN_WIDTH) {
    return {
      sidebarWidth: SIDEBAR_MIN_WIDTH,
      detailWidth: DETAIL_MIN_WIDTH,
    };
  }

  let overflow = nextSidebarWidth + nextDetailWidth - maxOuterColumnsWidth;
  if (overflow <= 0) {
    return {
      sidebarWidth: nextSidebarWidth,
      detailWidth: nextDetailWidth,
    };
  }

  const detailReduction = Math.min(overflow, nextDetailWidth - DETAIL_MIN_WIDTH);
  nextDetailWidth -= detailReduction;
  overflow -= detailReduction;

  if (overflow > 0) {
    nextSidebarWidth -= Math.min(overflow, nextSidebarWidth - SIDEBAR_MIN_WIDTH);
  }

  return {
    sidebarWidth: nextSidebarWidth,
    detailWidth: nextDetailWidth,
  };
};

export function NormalModeLayout({
  activeFilter,
  attachmentDeletingIds,
  attachmentError,
  attachments,
  attachmentsAdding,
  attachmentsCapturing,
  attachmentsLoading,
  onCancelScreenshotAttachment,
  onConfirmScreenshotAttachment,
  pendingScreenshot,
  screenshotEditing,
  taskAppError,
  taskApps,
  taskAppsAdding,
  taskAppsLaunching,
  taskAppsLoading,
  lastTaskAppsStartedAt,
  filteredTasks,
  onAddTask,
  onAddImageAttachment,
  onAddScreenshotAttachment,
  onAddTaskApp,
  onDeleteAttachment,
  onDeleteTaskApp,
  onDeleteTask,
  onFilterChange,
  onSearchChange,
  onSelectTask,
  onSwitchToPin,
  onToggleTask,
  onStartTaskApps,
  onUpdateTask,
  onUpdateTaskAppName,
  onRetryPersistTasks,
  persistenceError,
  saving,
  searchQuery,
  selectedTask,
  selectedTaskId,
  lastSavedAt,
  tasks,
}: NormalModeLayoutProps) {
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const [detailWidth, setDetailWidth] = useState(DEFAULT_DETAIL_WIDTH);
  const [activeResizeHandle, setActiveResizeHandle] = useState<"sidebar" | "detail" | null>(null);
  const openTasks = filteredTasks.filter((task) => !task.completed);
  const title =
    activeFilter === "important"
      ? "Important"
      : activeFilter === "all"
        ? "All Tasks"
        : activeFilter === "pinned"
          ? "Pinned"
          : "Today";
  const hasSearch = Boolean(searchQuery.trim());
  const gridTemplateColumns = `${sidebarWidth}px minmax(${TASK_LIST_MIN_WIDTH}px, 1fr) ${detailWidth}px`;

  useEffect(() => {
    const handleWindowResize = () => {
      const nextWidths = normalizePanelWidths(sidebarWidth, detailWidth);

      setSidebarWidth(nextWidths.sidebarWidth);
      setDetailWidth(nextWidths.detailWidth);
    };

    window.addEventListener("resize", handleWindowResize);
    return () => window.removeEventListener("resize", handleWindowResize);
  }, [detailWidth, sidebarWidth]);

  const startResize = (handle: "sidebar" | "detail") => (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();

    const startX = event.clientX;
    const startSidebarWidth = sidebarWidth;
    const startDetailWidth = detailWidth;
    const previousUserSelect = document.body.style.userSelect;
    const previousCursor = document.body.style.cursor;

    event.currentTarget.setPointerCapture?.(event.pointerId);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    setActiveResizeHandle(handle);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const availableWidth = getAvailableColumnWidth();
      const delta = moveEvent.clientX - startX;

      if (handle === "sidebar") {
        const maxSidebarWidth = Math.max(
          SIDEBAR_MIN_WIDTH,
          Math.min(SIDEBAR_MAX_WIDTH, availableWidth - startDetailWidth - TASK_LIST_MIN_WIDTH),
        );
        setSidebarWidth(clamp(startSidebarWidth + delta, SIDEBAR_MIN_WIDTH, maxSidebarWidth));
        return;
      }

      const maxDetailWidth = Math.max(
        DETAIL_MIN_WIDTH,
        Math.min(DETAIL_MAX_WIDTH, availableWidth - startSidebarWidth - TASK_LIST_MIN_WIDTH),
      );
      setDetailWidth(clamp(startDetailWidth - delta, DETAIL_MIN_WIDTH, maxDetailWidth));
    };

    const stopResize = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      document.body.style.userSelect = previousUserSelect;
      document.body.style.cursor = previousCursor;
      setActiveResizeHandle(null);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopResize, { once: true });
  };

  return (
    <main
      className="app-shell-bg relative grid h-full min-h-0 gap-4 overflow-hidden p-5"
      data-testid="normal-mode-layout"
      style={{ gridTemplateColumns }}
    >
      <Sidebar activeFilter={activeFilter} onFilterChange={onFilterChange} tasks={tasks} />

      <div
        aria-label="Resize sidebar and task list"
        aria-orientation="vertical"
        aria-valuemax={SIDEBAR_MAX_WIDTH}
        aria-valuemin={SIDEBAR_MIN_WIDTH}
        aria-valuenow={sidebarWidth}
        className="column-resize-handle"
        data-active={activeResizeHandle === "sidebar"}
        onPointerDown={startResize("sidebar")}
        role="separator"
        style={{ left: `${20 + sidebarWidth}px` }}
        tabIndex={0}
      />

      <section className="surface-panel flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-[var(--radius-panel)] border p-5">
        <header className="mb-5 flex shrink-0 items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium uppercase text-[var(--text-faint)]">
              <MonitorUp className="h-3.5 w-3.5" />
              Normal Window Mode
            </div>
            <h2 className="mt-2 text-3xl font-semibold tracking-normal text-[var(--text-primary)]">{title}</h2>
          </div>
          <Button aria-label="Switch to Desktop Pin Mode" onClick={onSwitchToPin} variant="secondary">
            <Pin className="h-4 w-4" />
            Pin
          </Button>
        </header>

        <div className="shrink-0">
          <QuickInput onAddTask={onAddTask} />
        </div>

        <label className="relative mt-4 block shrink-0" htmlFor="task-search">
          <span className="sr-only">Search tasks</span>
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-faint)]" />
          <Input
            className="pl-10"
            id="task-search"
            placeholder="Search tasks"
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </label>

        <div className="my-5 flex shrink-0 items-center justify-between text-sm">
          <span className="text-[var(--text-muted)]">{openTasks.length} open</span>
          <span className="text-[var(--text-faint)]">{filteredTasks.length - openTasks.length} completed</span>
        </div>

        {filteredTasks.length > 0 ? (
          <TaskList
            onSelect={onSelectTask}
            onToggle={onToggleTask}
            selectedTaskId={selectedTaskId}
            tasks={filteredTasks}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center rounded-3xl border border-dashed border-[var(--border-soft)] bg-[var(--surface-card-hover)] p-6 text-center text-sm text-[var(--text-faint)]">
            {hasSearch ? "No tasks match your search." : "No tasks in this view."}
          </div>
        )}
      </section>

      <div
        aria-label="Resize task list and detail panel"
        aria-orientation="vertical"
        aria-valuemax={DETAIL_MAX_WIDTH}
        aria-valuemin={DETAIL_MIN_WIDTH}
        aria-valuenow={detailWidth}
        className="column-resize-handle"
        data-active={activeResizeHandle === "detail"}
        onPointerDown={startResize("detail")}
        role="separator"
        style={{ right: `${20 + detailWidth}px` }}
        tabIndex={0}
      />

      <DetailPanel
        attachmentDeletingIds={attachmentDeletingIds}
        attachmentError={attachmentError}
        attachments={attachments}
        attachmentsAdding={attachmentsAdding}
        attachmentsCapturing={attachmentsCapturing}
        attachmentsLoading={attachmentsLoading}
        onCancelScreenshotAttachment={onCancelScreenshotAttachment}
        onConfirmScreenshotAttachment={onConfirmScreenshotAttachment}
        pendingScreenshot={pendingScreenshot}
        screenshotEditing={screenshotEditing}
        taskAppError={taskAppError}
        taskApps={taskApps}
        taskAppsAdding={taskAppsAdding}
        taskAppsLaunching={taskAppsLaunching}
        taskAppsLoading={taskAppsLoading}
        lastTaskAppsStartedAt={lastTaskAppsStartedAt}
        lastSavedAt={lastSavedAt}
        onAddImageAttachment={onAddImageAttachment}
        onAddScreenshotAttachment={onAddScreenshotAttachment}
        onAddTaskApp={onAddTaskApp}
        onDeleteAttachment={onDeleteAttachment}
        onDeleteTaskApp={onDeleteTaskApp}
        onDeleteTask={onDeleteTask}
        onStartTaskApps={onStartTaskApps}
        onUpdateTask={onUpdateTask}
        onUpdateTaskAppName={onUpdateTaskAppName}
        onRetryPersistTasks={onRetryPersistTasks}
        persistenceError={persistenceError}
        saving={saving}
        task={selectedTask}
      />
    </main>
  );
}
