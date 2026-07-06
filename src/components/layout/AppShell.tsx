import { useCallback, useEffect, useRef, useState } from "react";

import { DesktopPinLayout } from "@/components/layout/DesktopPinLayout";
import { NormalModeLayout } from "@/components/layout/NormalModeLayout";
import { TrashPanel } from "@/components/layout/TrashPanel";
import { WindowTitleBar } from "@/components/layout/WindowTitleBar";
import { UndoToast } from "@/components/ui/undo-toast";
import { useI18n } from "@/i18n/useI18n";
import { applyWindowMode } from "@/lib/windowMode";
import { useAttachmentStore } from "@/stores/attachmentStore";
import { usePreferencesStore } from "@/stores/preferencesStore";
import { useTaskAppStore } from "@/stores/taskAppStore";
import { getLocalDateKey, getOverdueTasks, useTaskStore } from "@/stores/taskStore";
import type { AppMode } from "@/types/task";

const MODE_EXIT_MS = 140;
const MODE_ENTER_MS = 220;
const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
// Slightly longer than the 200ms CSS exit transition so it finishes cleanly.
const LIST_EXIT_MS = 230;

type ModeTransition = "normal-exit" | "normal-enter" | "pin-exit" | "pin-enter" | null;

type UndoToastState = {
  id: number;
  message: string;
  onUndo: () => void;
};

export function AppShell() {
  const { t } = useI18n();
  const tasks = useTaskStore((state) => state.tasks);
  const selectedTaskId = useTaskStore((state) => state.selectedTaskId);
  const mode = useTaskStore((state) => state.mode);
  const activeFilter = useTaskStore((state) => state.activeFilter);
  const searchQuery = useTaskStore((state) => state.searchQuery);
  const hydrated = useTaskStore((state) => state.hydrated);
  const loading = useTaskStore((state) => state.loading);
  const saving = useTaskStore((state) => state.saving);
  const lastSavedAt = useTaskStore((state) => state.lastSavedAt);
  const error = useTaskStore((state) => state.error);
  const hydrateTasks = useTaskStore((state) => state.hydrateTasks);
  const loadPreferences = usePreferencesStore((state) => state.loadPreferences);
  const addTask = useTaskStore((state) => state.addTask);
  const updateTask = useTaskStore((state) => state.updateTask);
  const retryPersistTasks = useTaskStore((state) => state.retryPersistTasks);
  const deleteTask = useTaskStore((state) => state.deleteTask);
  const toggleTask = useTaskStore((state) => state.toggleTask);
  const selectTask = useTaskStore((state) => state.selectTask);
  const setMode = useTaskStore((state) => state.setMode);
  const setActiveFilter = useTaskStore((state) => state.setActiveFilter);
  const setSearchQuery = useTaskStore((state) => state.setSearchQuery);
  const getStackViews = useTaskStore((state) => state.getStackViews);
  const getTodayCompletedStackViews = useTaskStore((state) => state.getTodayCompletedStackViews);
  const toggleStackCollapsed = useTaskStore((state) => state.toggleStackCollapsed);
  const reorderStacks = useTaskStore((state) => state.reorderStacks);
  const reorderTaskWithinStack = useTaskStore((state) => state.reorderTaskWithinStack);
  const moveTaskToStack = useTaskStore((state) => state.moveTaskToStack);
  const splitTaskToNewStack = useTaskStore((state) => state.splitTaskToNewStack);
  const applySidebarDrop = useTaskStore((state) => state.applySidebarDrop);
  const trashTask = useTaskStore((state) => state.trashTask);
  const restoreTask = useTaskStore((state) => state.restoreTask);
  const undoLastMerge = useTaskStore((state) => state.undoLastMerge);
  const attachmentsByTaskId = useAttachmentStore((state) => state.itemsByTaskId);
  const attachmentLoadingTaskIds = useAttachmentStore((state) => state.loadingTaskIds);
  const attachmentsAdding = useAttachmentStore((state) => state.adding);
  const attachmentsCapturing = useAttachmentStore((state) => state.capturing);
  const screenshotEditing = useAttachmentStore((state) => state.screenshotEditing);
  const pendingScreenshot = useAttachmentStore((state) => state.pendingScreenshot);
  const attachmentDeletingIds = useAttachmentStore((state) => state.deletingIds);
  const attachmentError = useAttachmentStore((state) => state.error);
  const loadAttachmentsByTaskId = useAttachmentStore((state) => state.loadByTaskId);
  const addImageAttachment = useAttachmentStore((state) => state.addImageAttachment);
  const addDroppedImageAttachments = useAttachmentStore((state) => state.addDroppedImageAttachments);
  const addPastedImageAttachment = useAttachmentStore((state) => state.addPastedImageAttachment);
  const addScreenshotAttachment = useAttachmentStore((state) => state.addScreenshotAttachment);
  const confirmScreenshotAttachment = useAttachmentStore((state) => state.confirmScreenshotAttachment);
  const cancelScreenshotAttachment = useAttachmentStore((state) => state.cancelScreenshotAttachment);
  const deleteAttachment = useAttachmentStore((state) => state.deleteAttachment);
  const deleteTaskWithAttachmentCleanup = useAttachmentStore((state) => state.deleteTaskWithAttachmentCleanup);
  const appsByTaskId = useTaskAppStore((state) => state.appsByTaskId);
  const appLoadingTaskIds = useTaskAppStore((state) => state.loadingTaskIds);
  const taskAppsAdding = useTaskAppStore((state) => state.adding);
  const taskAppsLaunching = useTaskAppStore((state) => state.launching);
  const taskAppError = useTaskAppStore((state) => state.error);
  const lastTaskAppsStartedAt = useTaskAppStore((state) => state.lastStartedAt);
  const loadTaskAppsByTaskId = useTaskAppStore((state) => state.loadByTaskId);
  const addTaskApp = useTaskAppStore((state) => state.addApp);
  const updateTaskAppName = useTaskAppStore((state) => state.updateAppName);
  const deleteTaskApp = useTaskAppStore((state) => state.deleteApp);
  const startTaskApps = useTaskAppStore((state) => state.startTask);
  const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? null;
  const stackViews = getStackViews(activeFilter);
  const todayCompletedStackViews = activeFilter === "today" ? getTodayCompletedStackViews() : [];
  const pinStackViews = getStackViews("all");
  const selectedTaskAttachments = selectedTaskId ? (attachmentsByTaskId[selectedTaskId] ?? []) : [];
  const selectedTaskAttachmentsLoading = selectedTaskId ? Boolean(attachmentLoadingTaskIds[selectedTaskId]) : false;
  const selectedTaskApps = selectedTaskId ? (appsByTaskId[selectedTaskId] ?? []) : [];
  const selectedTaskAppsLoading = selectedTaskId ? Boolean(appLoadingTaskIds[selectedTaskId]) : false;
  const [modeTransition, setModeTransition] = useState<ModeTransition>(null);
  const modeTransitionTimeoutsRef = useRef<number[]>([]);

  const clearModeTransitionTimers = useCallback(() => {
    modeTransitionTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
    modeTransitionTimeoutsRef.current = [];
  }, []);

  const switchModeWithTransition = useCallback(
    (nextMode: AppMode) => {
      if (nextMode === mode) {
        return;
      }

      clearModeTransitionTimers();
      setModeTransition(`${mode}-exit`);

      const exitTimeoutId = window.setTimeout(() => {
        setMode(nextMode);
        setModeTransition(`${nextMode}-enter`);

        const enterTimeoutId = window.setTimeout(() => {
          setModeTransition(null);
        }, MODE_ENTER_MS);

        modeTransitionTimeoutsRef.current.push(enterTimeoutId);
      }, MODE_EXIT_MS);

      modeTransitionTimeoutsRef.current.push(exitTimeoutId);
    },
    [clearModeTransitionTimers, mode, setMode],
  );

  useEffect(() => {
    loadPreferences();
  }, [loadPreferences]);

  useEffect(() => {
    return () => {
      clearModeTransitionTimers();
    };
  }, [clearModeTransitionTimers]);

  useEffect(() => {
    void hydrateTasks();
  }, [hydrateTasks]);

  useEffect(() => {
    void applyWindowMode(mode);
  }, [mode]);

  useEffect(() => {
    if (hydrated && mode === "normal" && selectedTaskId) {
      void loadAttachmentsByTaskId(selectedTaskId);
    }
  }, [hydrated, loadAttachmentsByTaskId, mode, selectedTaskId]);

  useEffect(() => {
    if (hydrated && mode === "normal" && selectedTaskId) {
      void loadTaskAppsByTaskId(selectedTaskId);
    }
  }, [hydrated, loadTaskAppsByTaskId, mode, selectedTaskId]);

  const [trashOpen, setTrashOpen] = useState(false);
  const [undoToast, setUndoToast] = useState<UndoToastState | null>(null);
  const [leavingTaskIds, setLeavingTaskIds] = useState<string[]>([]);
  const overdueTasks = getOverdueTasks(tasks);
  const undoToastIdRef = useRef(0);

  // Mark a card as leaving, let the exit animation play, then commit the
  // store mutation and clear the mark. Pending commits are flushed on unmount
  // so a mode switch (or teardown) never loses a queued mutation.
  const pendingExitCommitsRef = useRef<Map<number, () => void>>(new Map());
  const commitAfterExit = useCallback((taskId: string, commit: () => void) => {
    setLeavingTaskIds((current) => (current.includes(taskId) ? current : [...current, taskId]));
    const run = () => {
      commit();
      setLeavingTaskIds((current) => current.filter((id) => id !== taskId));
    };
    const timeoutId = window.setTimeout(() => {
      pendingExitCommitsRef.current.delete(timeoutId);
      run();
    }, LIST_EXIT_MS);
    pendingExitCommitsRef.current.set(timeoutId, run);
  }, []);

  useEffect(() => () => {
    pendingExitCommitsRef.current.forEach((run, timeoutId) => {
      window.clearTimeout(timeoutId);
      run();
    });
    pendingExitCommitsRef.current.clear();
  }, []);
  const trashedTasks = tasks.filter((task) => task.deletedAt);
  const trashedCount = trashedTasks.length;

  const showUndoToast = useCallback((message: string, onUndo: () => void) => {
    undoToastIdRef.current += 1;
    setUndoToast({ id: undoToastIdRef.current, message, onUndo });
  }, []);

  const runUndoToast = useCallback(() => {
    setUndoToast((current) => {
      current?.onUndo();
      return null;
    });
  }, []);

  // Ctrl+Z triggers the pending undo while the toast is visible.
  useEffect(() => {
    if (!undoToast) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!event.ctrlKey || event.key.toLowerCase() !== "z") {
        return;
      }
      const target = event.target;
      if (target instanceof HTMLElement && target.closest("input, textarea, [contenteditable='true']")) {
        return;
      }
      event.preventDefault();
      runUndoToast();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [runUndoToast, undoToast]);

  // Move to trash instead of hard-deleting; attachments are cleaned up only on purge.
  const handleDeleteTask = (id: string) => {
    const task = useTaskStore.getState().tasks.find((candidate) => candidate.id === id && !candidate.deletedAt);
    if (!task) {
      return;
    }

    commitAfterExit(id, () => {
      if (!trashTask(id)) {
        return;
      }

      showUndoToast(`${t("trash.movedToast")}「${task.title}」`, () => {
        restoreTask(id);
      });
    });
  };

  // Completing a task in Today removes its view from the list; delay the
  // store toggle so the card can play its exit animation first. The checkbox
  // itself flips optimistically inside TaskItem.
  const handleToggleTask = (id: string) => {
    const state = useTaskStore.getState();
    const task = state.tasks.find((candidate) => candidate.id === id);
    if (!task) {
      return;
    }

    const today = getLocalDateKey();
    const viewLeavesList = state.activeFilter === "today" && (
      task.completed
        ? // Reopening from the completed-today section removes it from that list.
          task.completedAt?.slice(0, 10) === today
        : // Completing removes the view when no other open today-task shares the stack.
          !state.tasks.some((candidate) =>
            candidate.id !== id &&
            candidate.stackId === task.stackId &&
            !candidate.deletedAt &&
            !candidate.completed &&
            candidate.plannedDate === today,
          )
    );

    if (viewLeavesList && mode === "normal") {
      commitAfterExit(id, () => toggleTask(id));
      return;
    }

    toggleTask(id);
  };

  const handleDropToTrash = (taskIds: string[]) => {
    const trashedIds = taskIds.filter((id) => trashTask(id));
    if (trashedIds.length === 0) {
      return;
    }

    showUndoToast(`${t("trash.movedToast")} (${trashedIds.length})`, () => {
      trashedIds.forEach((id) => restoreTask(id));
    });
  };

  const handleMoveTaskToStack = (taskId: string, targetStackId: string, targetIndex?: number) => {
    const moved = moveTaskToStack(taskId, targetStackId, targetIndex);
    if (moved) {
      showUndoToast(t("stack.mergedToast"), () => {
        undoLastMerge();
      });
    }
    return moved;
  };

  const handlePurgeTask = useCallback((id: string) => {
    void deleteTaskWithAttachmentCleanup(id, deleteTask);
  }, [deleteTask, deleteTaskWithAttachmentCleanup]);

  const handleEmptyTrash = () => {
    useTaskStore.getState().getTrashedTasks().forEach((task) => handlePurgeTask(task.id));
  };

  // Auto-purge trashed tasks older than the retention window once per launch.
  const autoPurgeRanRef = useRef(false);
  useEffect(() => {
    if (!hydrated || autoPurgeRanRef.current) {
      return;
    }

    autoPurgeRanRef.current = true;
    const cutoff = Date.now() - TRASH_RETENTION_MS;
    useTaskStore.getState().getTrashedTasks().forEach((task) => {
      const deletedAtMs = task.deletedAt ? Date.parse(task.deletedAt) : Number.NaN;
      if (Number.isFinite(deletedAtMs) && deletedAtMs < cutoff) {
        handlePurgeTask(task.id);
      }
    });
  }, [handlePurgeTask, hydrated]);

  if (!hydrated) {
    return (
      <div className="app-shell-bg flex h-screen flex-col">
        <WindowTitleBar mode={mode} />
        <div className="flex min-h-0 flex-1 items-center justify-center px-6 text-sm text-[color:var(--text-secondary)]">
          {loading ? t("app.loadingTasks") : error ? t("app.loadFailed") : t("app.preparingTasks")}
        </div>
      </div>
    );
  }

  if (mode === "pin") {
    return (
      <div className="app-shell-bg flex h-screen flex-col">
        <WindowTitleBar mode={mode} />
        <div className="min-h-0 flex-1">
          <DesktopPinLayout
            modeTransition={modeTransition}
            onAddTask={addTask}
            onSelectTask={selectTask}
            onSwitchToNormal={() => switchModeWithTransition("normal")}
            onToggleTask={toggleTask}
            selectedTaskId={selectedTaskId}
            stackViews={pinStackViews}
            tasks={tasks}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell-bg normal-mode-shell flex h-screen flex-col">
      <WindowTitleBar mode={mode} />
      <div className="min-h-0 flex-1">
        <NormalModeLayout
          activeFilter={activeFilter}
          stackViews={stackViews}
          todayCompletedStackViews={todayCompletedStackViews}
          onAddTask={addTask}
          onDeleteTask={handleDeleteTask}
          attachments={selectedTaskAttachments}
          attachmentsAdding={attachmentsAdding}
          attachmentsCapturing={attachmentsCapturing}
          screenshotEditing={screenshotEditing}
          pendingScreenshot={pendingScreenshot}
          attachmentDeletingIds={attachmentDeletingIds}
          attachmentError={attachmentError}
          attachmentsLoading={selectedTaskAttachmentsLoading}
          taskAppError={taskAppError}
          taskApps={selectedTaskApps}
          taskAppsAdding={taskAppsAdding}
          taskAppsLaunching={taskAppsLaunching}
          taskAppsLoading={selectedTaskAppsLoading}
          lastTaskAppsStartedAt={lastTaskAppsStartedAt}
          onAddImageAttachment={(taskId) => {
            void addImageAttachment(taskId);
          }}
          onAddDroppedImageAttachments={(taskId, paths) => {
            void addDroppedImageAttachments(taskId, paths);
          }}
          onAddPastedImageAttachment={(taskId, bytes, mimeType) => {
            void addPastedImageAttachment(taskId, bytes, mimeType);
          }}
          onAddScreenshotAttachment={(taskId) => {
            void addScreenshotAttachment(taskId);
          }}
          onCancelScreenshotAttachment={cancelScreenshotAttachment}
          onConfirmScreenshotAttachment={(screenshot) => {
            void confirmScreenshotAttachment(screenshot);
          }}
          onAddTaskApp={(taskId) => {
            void addTaskApp(taskId);
          }}
          onDeleteAttachment={(attachmentId) => {
            void deleteAttachment(attachmentId);
          }}
          onDeleteTaskApp={(appId) => {
            void deleteTaskApp(appId);
          }}
          onStartTaskApps={(taskId) => {
            void startTaskApps(taskId);
          }}
          onUpdateTaskAppName={(appId, appName) => {
            void updateTaskAppName(appId, appName);
          }}
          onRetryPersistTasks={retryPersistTasks}
          onFilterChange={setActiveFilter}
          onSelectTask={selectTask}
          onSearchChange={setSearchQuery}
          onSwitchToPin={() => switchModeWithTransition("pin")}
          onMoveTaskToStack={handleMoveTaskToStack}
          onReorderStacks={reorderStacks}
          onReorderTaskWithinStack={reorderTaskWithinStack}
          onSplitTaskToNewStack={splitTaskToNewStack}
          onSidebarDrop={applySidebarDrop}
          onDropToTrash={handleDropToTrash}
          onOpenTrash={() => setTrashOpen(true)}
          trashedCount={trashedCount}
          leavingTaskIds={leavingTaskIds}
          overdueTasks={overdueTasks}
          onMoveAllOverdueToToday={() => {
            applySidebarDrop(overdueTasks.map((task) => task.id), "today");
          }}
          onToggleStackCollapsed={toggleStackCollapsed}
          onToggleTask={handleToggleTask}
          onUpdateTask={updateTask}
          modeTransition={modeTransition}
          persistenceError={error}
          saving={saving}
          searchQuery={searchQuery}
          selectedTask={selectedTask}
          selectedTaskId={selectedTaskId}
          lastSavedAt={lastSavedAt}
          tasks={tasks}
        />
      </div>
      <TrashPanel
        open={trashOpen}
        trashedTasks={trashedTasks}
        onClose={() => setTrashOpen(false)}
        onEmpty={handleEmptyTrash}
        onPurge={handlePurgeTask}
        onRestore={(id) => {
          restoreTask(id);
        }}
      />
      {undoToast && (
        <UndoToast
          actionLabel={t("common.undo")}
          key={undoToast.id}
          message={undoToast.message}
          onAction={runUndoToast}
          onDismiss={() => setUndoToast(null)}
        />
      )}
    </div>
  );
}
