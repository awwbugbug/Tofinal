import { type PointerEvent as ReactPointerEvent, useEffect, useState } from "react";
import { PanelTopOpen, Search } from "lucide-react";

import { Sidebar } from "@/components/layout/Sidebar";
import { DetailPanel } from "@/components/layout/DetailPanel";
import { QuickInput } from "@/components/task/QuickInput";
import { TaskList } from "@/components/task/TaskList";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CalendarPopover } from "@/components/ui/calendar-popover";
import { ProgressRing } from "@/components/ui/progress-ring";
import { useI18n } from "@/i18n/useI18n";
import { getLocalDateKey } from "@/stores/taskStore";
import { usePreferencesStore } from "@/stores/preferencesStore";
import type { AttachmentView, FinalScreenshot, PendingScreenshot } from "@/stores/attachmentStore";
import type { TaskAppView } from "@/stores/taskAppStore";
import type { Task, TaskFilter, TaskStackView } from "@/types/task";

type NormalModeLayoutProps = {
  tasks: Task[];
  stackViews: TaskStackView[];
  todayCompletedStackViews: TaskStackView[];
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
  onAddDroppedImageAttachments: (taskId: string, paths: string[]) => void;
  onAddPastedImageAttachment: (taskId: string, bytes: Uint8Array, mimeType: string) => void;
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
  onToggleStackCollapsed: (stackId: string) => void;
  onReorderStacks: (sourceStackId: string, targetIndex: number, visibleStackIds: string[]) => boolean;
  onReorderTaskWithinStack: (stackId: string, taskId: string, targetIndex: number) => boolean;
  onMoveTaskToStack: (taskId: string, targetStackId: string, targetIndex?: number) => boolean;
  onSplitTaskToNewStack: (taskId: string, targetGlobalIndex: number, visibleStackIds: string[]) => boolean;
  onSidebarDrop: (taskIds: string[], target: TaskFilter) => boolean;
  onDropToTrash: (taskIds: string[]) => void;
  onOpenTrash: () => void;
  trashedCount: number;
  leavingTaskIds: string[];
  overdueTasks: Task[];
  onMoveAllOverdueToToday: () => void;
  viewDateKey: string;
  onViewDateChange: (dateKey: string) => void;
  onUpdateTask: (
    id: string,
    update: Partial<Pick<Task, "title" | "note" | "priority" | "tags" | "pinned" | "plannedDate">>,
  ) => boolean;
  onSwitchToPin: () => void;
  modeTransition?: string | null;
};

const DEFAULT_SIDEBAR_WIDTH = 248;
const DEFAULT_DETAIL_WIDTH = 340;
const SIDEBAR_MIN_WIDTH = 220;
const SIDEBAR_MAX_WIDTH = 360;
const DETAIL_MIN_WIDTH = 360;
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

const countStackTasks = (stackViews: TaskStackView[]) => stackViews.reduce((count, view) => count + view.tasks.length, 0);

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
  stackViews,
  todayCompletedStackViews,
  onAddTask,
  onAddImageAttachment,
  onAddDroppedImageAttachments,
  onAddPastedImageAttachment,
  onAddScreenshotAttachment,
  onAddTaskApp,
  onDeleteAttachment,
  onDeleteTaskApp,
  onDeleteTask,
  onFilterChange,
  onSearchChange,
  onSelectTask,
  onSwitchToPin,
  leavingTaskIds,
  onDropToTrash,
  onMoveAllOverdueToToday,
  onMoveTaskToStack,
  onOpenTrash,
  onViewDateChange,
  overdueTasks,
  viewDateKey,
  onReorderStacks,
  onReorderTaskWithinStack,
  onSidebarDrop,
  onSplitTaskToNewStack,
  trashedCount,
  onToggleStackCollapsed,
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
  modeTransition = null,
  tasks,
}: NormalModeLayoutProps) {
  const { t } = useI18n();
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const [detailWidth, setDetailWidth] = useState(DEFAULT_DETAIL_WIDTH);
  const [activeResizeHandle, setActiveResizeHandle] = useState<"sidebar" | "detail" | null>(null);
  const visibleTasks = stackViews.flatMap((view) => view.tasks);
  const openTasks = visibleTasks.filter((task) => !task.completed);
  const completedTasks = visibleTasks.filter((task) => task.completed);
  const hasSearch = Boolean(searchQuery.trim());
  const showTodayCompletedSection = activeFilter === "today" && todayCompletedStackViews.length > 0;

  // The date view: the first sidebar item is parameterized by viewDateKey.
  // Viewing today keeps the original Today behavior (overdue section, ring);
  // other dates show that day's planned tasks (and, for past dates, what was
  // completed on that day).
  const language = usePreferencesStore((state) => state.language);
  const locale = language === "en-US" ? "en-US" : "zh-CN";
  const isDateView = activeFilter === "today";
  const todayKey = getLocalDateKey();
  const isViewingToday = viewDateKey === todayKey;
  const showOverdueSection = isDateView && isViewingToday && !hasSearch && overdueTasks.length > 0;
  const [dateCalendarOpen, setDateCalendarOpen] = useState(false);

  const parseViewDate = (() => {
    const [year, month, day] = viewDateKey.split("-").map(Number);
    return new Date(year || 1970, (month || 1) - 1, day || 1);
  })();
  const tomorrowKey = getLocalDateKey(new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate() + 1));
  const shiftDateKey = (delta: number) =>
    getLocalDateKey(new Date(parseViewDate.getFullYear(), parseViewDate.getMonth(), parseViewDate.getDate() + delta));
  const neighborDateLabel = (dateKey: string) => {
    if (dateKey === todayKey) {
      return t("date.today");
    }
    if (dateKey === tomorrowKey) {
      return t("date.tomorrow");
    }
    const [year, month, day] = dateKey.split("-").map(Number);
    return new Intl.DateTimeFormat(locale, { month: language === "en-US" ? "short" : "long", day: "numeric" })
      .format(new Date(year || 1970, (month || 1) - 1, day || 1));
  };

  const title =
    activeFilter === "important"
      ? t("filters.important")
      : activeFilter === "all"
        ? t("filters.all")
        : activeFilter === "pinned"
          ? t("filters.pinned")
          : isViewingToday
            ? t("filters.today")
            : viewDateKey === tomorrowKey
              ? t("date.tomorrow")
              : new Intl.DateTimeFormat(locale, { month: "long", day: "numeric" }).format(parseViewDate);

  const liveTasks = tasks.filter((task) => !task.deletedAt);
  const completedTodayCount = liveTasks.filter(
    (task) => task.completed && task.completedAt?.slice(0, 10) === todayKey,
  ).length;
  const openTodayCount = liveTasks.filter((task) => !task.completed && task.plannedDate === todayKey).length;
  const todayTotal = completedTodayCount + openTodayCount + overdueTasks.length;
  const allDoneToday = todayTotal > 0 && completedTodayCount === todayTotal;
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
      data-mode-transition={modeTransition ?? undefined}
      data-testid="normal-mode-layout"
      style={{ gridTemplateColumns }}
    >
      <Sidebar
        activeFilter={activeFilter}
        onFilterChange={onFilterChange}
        onOpenTrash={onOpenTrash}
        tasks={tasks}
        trashedCount={trashedCount}
        viewDateKey={viewDateKey}
      />

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

      <section className="surface-panel flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-[var(--radius-panel)] border px-5 pb-5 pt-8">
        <header className="mb-5 flex min-h-11 shrink-0 items-center justify-between gap-4">
          <div className="min-w-0">
            {isDateView ? (
              <div className="relative">
                <div className="view-title-carousel">
                  <button
                    aria-label={t("date.previousDay")}
                    className="view-title-neighbor view-title-neighbor-prev"
                    onClick={() => {
                      setDateCalendarOpen(false);
                      onViewDateChange(shiftDateKey(-1));
                    }}
                    tabIndex={-1}
                    type="button"
                  >
                    {neighborDateLabel(shiftDateKey(-1))}
                  </button>
                  <h2 className="text-3xl font-semibold tracking-normal text-[var(--text-primary)]">
                    <button
                      aria-label={t("date.pickViewDate")}
                      className="view-title-trigger"
                      data-testid="view-date-trigger"
                      onClick={() => setDateCalendarOpen((current) => !current)}
                      type="button"
                    >
                      {title}
                    </button>
                  </h2>
                  <button
                    aria-label={t("date.nextDay")}
                    className="view-title-neighbor view-title-neighbor-next"
                    onClick={() => {
                      setDateCalendarOpen(false);
                      onViewDateChange(shiftDateKey(1));
                    }}
                    tabIndex={-1}
                    type="button"
                  >
                    {neighborDateLabel(shiftDateKey(1))}
                  </button>
                </div>
                {dateCalendarOpen && (
                  <CalendarPopover
                    onClose={() => setDateCalendarOpen(false)}
                    onSelect={(dateKey) => {
                      setDateCalendarOpen(false);
                      onViewDateChange(dateKey);
                    }}
                    todayShortcutLabel={t("date.backToToday")}
                    value={viewDateKey}
                  />
                )}
              </div>
            ) : (
              <h2 className="text-3xl font-semibold tracking-normal text-[var(--text-primary)]">{title}</h2>
            )}
          </div>
          {isDateView && isViewingToday && todayTotal > 0 && (
            <div className="ml-auto flex shrink-0 items-center gap-2.5">
              {allDoneToday && (
                <span className="text-xs font-medium text-[var(--accent-hover)]">{t("task.allDoneToday")}</span>
              )}
              <ProgressRing label={`${completedTodayCount}/${todayTotal}`} value={completedTodayCount / todayTotal} />
            </div>
          )}
          <Button
            aria-label={t("window.switchToPin")}
            className="mode-switch-button"
            onClick={onSwitchToPin}
            size="icon"
            variant="secondary"
          >
            <PanelTopOpen className="h-4 w-4" />
          </Button>
        </header>

        <div className="shrink-0">
          <QuickInput onAddTask={onAddTask} />
        </div>

        <label className="relative mt-4 block shrink-0" htmlFor="task-search">
          <span className="sr-only">{t("task.search")}</span>
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-faint)]" />
          <Input
            className="pl-10"
            id="task-search"
            placeholder={t("task.search")}
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </label>

        <div className="my-5 flex shrink-0 items-center justify-between text-sm">
          <span className="text-[var(--text-muted)]">{openTasks.length}{t("task.openCount")}</span>
          <span className="text-[var(--text-faint)]">{completedTasks.length}{t("task.completedCount")}</span>
        </div>

        {stackViews.length > 0 || showTodayCompletedSection || showOverdueSection ? (
          <div className="-mx-5 min-h-0 flex-1 overflow-hidden px-5">
            <div className="h-full min-h-0 overflow-y-auto px-3 pb-7 pt-3 no-scrollbar">
              {showOverdueSection && (
                <section aria-label={t("task.overdue")} className="mb-5 space-y-3" data-testid="overdue-section">
                  <div className="flex items-center justify-between gap-3 text-xs font-medium uppercase">
                    <span className="task-overdue-label">
                      {t("task.overdue")} {overdueTasks.length}
                    </span>
                    <Button
                      aria-label={t("task.moveAllToToday")}
                      className="h-7 px-2.5 text-xs normal-case"
                      onClick={onMoveAllOverdueToToday}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      {t("task.moveAllToToday")}
                    </Button>
                  </div>
                  <TaskList
                    embedded
                    leavingTaskIds={leavingTaskIds}
                    onDropToTrash={onDropToTrash}
                    onSelect={onSelectTask}
                    onSidebarDrop={onSidebarDrop}
                    onToggle={onToggleTask}
                    selectedTaskId={selectedTaskId}
                    tasks={overdueTasks}
                    testId="overdue-task-list"
                  />
                </section>
              )}
              {stackViews.length > 0 ? (
                <TaskList
                  embedded
                  onSelect={onSelectTask}
                  onToggle={onToggleTask}
                  onMoveTaskToStack={onMoveTaskToStack}
                  onReorderStacks={onReorderStacks}
                  onReorderTaskWithinStack={onReorderTaskWithinStack}
                  onSplitTaskToNewStack={onSplitTaskToNewStack}
                  onSidebarDrop={onSidebarDrop}
                  onDropToTrash={onDropToTrash}
                  leavingTaskIds={leavingTaskIds}
                  onToggleStackCollapsed={onToggleStackCollapsed}
                  selectedTaskId={selectedTaskId}
                  stackViews={stackViews}
                />
              ) : (
                <div className="flex min-h-40 items-center justify-center rounded-3xl border border-dashed border-[var(--border-soft)] bg-[var(--surface-card-hover)] p-6 text-center text-sm text-[var(--text-faint)]">
                  {hasSearch
                    ? t("task.noSearchResults")
                    : isDateView && !isViewingToday
                      ? t("task.noTasksForDate")
                      : t("task.noTasksToday")}
                </div>
              )}
              {showTodayCompletedSection && (
                <section className="mt-5 space-y-3" aria-label={t(isViewingToday ? "task.completedToday" : "task.completedOnDate")}>
                  <div className="flex items-center justify-between text-xs font-medium uppercase text-[var(--text-faint)]">
                    <span>{t(isViewingToday ? "task.completedToday" : "task.completedOnDate")}</span>
                    <span>{countStackTasks(todayCompletedStackViews)}</span>
                  </div>
                  <TaskList
                    embedded
                    onSelect={onSelectTask}
                    onToggle={onToggleTask}
                    onMoveTaskToStack={onMoveTaskToStack}
                    onReorderStacks={onReorderStacks}
                    onReorderTaskWithinStack={onReorderTaskWithinStack}
                    onSplitTaskToNewStack={onSplitTaskToNewStack}
                    onSidebarDrop={onSidebarDrop}
                    onDropToTrash={onDropToTrash}
                  leavingTaskIds={leavingTaskIds}
                    onToggleStackCollapsed={onToggleStackCollapsed}
                    selectedTaskId={selectedTaskId}
                    stackViews={todayCompletedStackViews}
                    testId="today-completed-task-list"
                  />
                </section>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center rounded-3xl border border-dashed border-[var(--border-soft)] bg-[var(--surface-card-hover)] p-6 text-center text-sm text-[var(--text-faint)]">
            {hasSearch ? t("task.noSearchResults") : activeFilter === "today" ? t("task.noTasksToday") : t("task.noTasksInView")}
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
        onAddDroppedImageAttachments={onAddDroppedImageAttachments}
        onAddPastedImageAttachment={onAddPastedImageAttachment}
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
