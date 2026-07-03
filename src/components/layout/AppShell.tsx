import { useCallback, useEffect, useRef, useState } from "react";

import { DesktopPinLayout } from "@/components/layout/DesktopPinLayout";
import { NormalModeLayout } from "@/components/layout/NormalModeLayout";
import { WindowTitleBar } from "@/components/layout/WindowTitleBar";
import { useI18n } from "@/i18n/useI18n";
import { applyWindowMode } from "@/lib/windowMode";
import { useAttachmentStore } from "@/stores/attachmentStore";
import { usePreferencesStore } from "@/stores/preferencesStore";
import { useTaskAppStore } from "@/stores/taskAppStore";
import { useTaskStore } from "@/stores/taskStore";
import type { AppMode } from "@/types/task";

const MODE_EXIT_MS = 140;
const MODE_ENTER_MS = 220;

type ModeTransition = "normal-exit" | "normal-enter" | "pin-exit" | "pin-enter" | null;

export function AppShell() {
  const { t } = useI18n();
  const tasks = useTaskStore((state) => state.tasks);
  const selectedTaskId = useTaskStore((state) => state.selectedTaskId);
  const highlightedTaskId = useTaskStore((state) => state.highlightedTaskId);
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

  const handleDeleteTask = (id: string) => {
    void deleteTaskWithAttachmentCleanup(id, deleteTask);
  };

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
          highlightedTaskId={highlightedTaskId}
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
          onToggleStackCollapsed={toggleStackCollapsed}
          onToggleTask={toggleTask}
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
    </div>
  );
}
