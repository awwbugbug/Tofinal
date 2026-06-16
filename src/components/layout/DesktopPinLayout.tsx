import { useEffect, useRef, useState } from "react";
import { Maximize2 } from "lucide-react";

import { QuickInput } from "@/components/task/QuickInput";
import { TaskList } from "@/components/task/TaskList";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/useI18n";
import { usePreferencesStore } from "@/stores/preferencesStore";
import type { Task } from "@/types/task";

type DesktopPinLayoutProps = {
  tasks: Task[];
  selectedTaskId: string | null;
  onAddTask: (title: string) => void;
  onSelectTask: (id: string) => void;
  onToggleTask: (id: string) => void;
  onSwitchToNormal: () => void;
};

export function DesktopPinLayout({
  onAddTask,
  onSelectTask,
  onSwitchToNormal,
  onToggleTask,
  selectedTaskId,
  tasks,
}: DesktopPinLayoutProps) {
  const { t } = useI18n();
  const completionCelebrationsEnabled = usePreferencesStore((state) => state.completionCelebrationsEnabled);
  const [recentlyCompletedTaskIds, setRecentlyCompletedTaskIds] = useState<string[]>([]);
  const celebrationTimeoutsRef = useRef(new Map<string, number>());
  const openTasks = tasks
    .filter((task) => !task.completed || recentlyCompletedTaskIds.includes(task.id))
    .sort((firstTask, secondTask) => Number(secondTask.pinned) - Number(firstTask.pinned));

  useEffect(() => {
    return () => {
      celebrationTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
      celebrationTimeoutsRef.current.clear();
    };
  }, []);

  useEffect(() => {
    if (completionCelebrationsEnabled) {
      return;
    }

    celebrationTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
    celebrationTimeoutsRef.current.clear();
    setRecentlyCompletedTaskIds([]);
  }, [completionCelebrationsEnabled]);

  const handleToggleTask = (id: string) => {
    const currentTask = tasks.find((task) => task.id === id);
    if (!currentTask) {
      return;
    }

    const willComplete = !currentTask.completed;
    if (completionCelebrationsEnabled && willComplete) {
      setRecentlyCompletedTaskIds((currentIds) => (currentIds.includes(id) ? currentIds : [...currentIds, id]));

      const existingTimeout = celebrationTimeoutsRef.current.get(id);
      if (existingTimeout !== undefined) {
        window.clearTimeout(existingTimeout);
      }

      const timeoutId = window.setTimeout(() => {
        setRecentlyCompletedTaskIds((currentIds) => currentIds.filter((taskId) => taskId !== id));
        celebrationTimeoutsRef.current.delete(id);
      }, 920);

      celebrationTimeoutsRef.current.set(id, timeoutId);
    }

    onToggleTask(id);
  };

  return (
    <main
      className="app-shell-bg flex h-full items-start justify-center p-3"
      data-testid="desktop-pin-layout"
    >
      <section className="surface-detail flex h-full w-full max-w-[360px] flex-col rounded-[1.75rem] border p-4">
        <header className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium uppercase text-[var(--text-faint)]">{t("mode.pin")}</p>
            <h1 className="mt-1 text-xl font-semibold tracking-normal text-[var(--text-primary)]">{t("sidebar.tasks")}</h1>
          </div>
          <Button aria-label={t("window.switchToNormal")} onClick={onSwitchToNormal} size="icon" variant="secondary">
            <Maximize2 className="h-4 w-4" />
          </Button>
        </header>

        <QuickInput compact onAddTask={onAddTask} />

        <div className="my-3 text-xs text-[var(--text-faint)]">{openTasks.length}{t("sidebar.openTasks")}</div>

        <TaskList
          compact
          limit={5}
          onSelect={onSelectTask}
          onToggle={handleToggleTask}
          selectedTaskId={selectedTaskId}
          tasks={openTasks}
        />
      </section>
    </main>
  );
}
