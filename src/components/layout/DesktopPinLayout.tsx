import { useEffect, useMemo, useRef, useState } from "react";
import { Maximize2 } from "lucide-react";

import { QuickInput } from "@/components/task/QuickInput";
import { TaskList } from "@/components/task/TaskList";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/useI18n";
import { usePreferencesStore } from "@/stores/preferencesStore";
import { getLocalDateKey } from "@/stores/taskStore";
import type { Task, TaskFilter, TaskStackView } from "@/types/task";

type DesktopPinLayoutProps = {
  tasks: Task[];
  stackViews: TaskStackView[];
  selectedTaskId: string | null;
  activeFilter: TaskFilter;
  viewDateKey: string;
  onAddTask: (title: string) => void;
  onSelectTask: (id: string) => void;
  onToggleTask: (id: string) => void;
  onSwitchToNormal: () => void;
  modeTransition?: string | null;
};

const stackHasPinnedTask = (view: TaskStackView) => view.tasks.some((task) => task.pinned);

export function DesktopPinLayout({
  activeFilter,
  modeTransition = null,
  onAddTask,
  onSelectTask,
  onSwitchToNormal,
  onToggleTask,
  selectedTaskId,
  stackViews,
  tasks,
  viewDateKey,
}: DesktopPinLayoutProps) {
  const { t } = useI18n();
  const language = usePreferencesStore((state) => state.language);
  const completionCelebrationsEnabled = usePreferencesStore((state) => state.completionCelebrationsEnabled);
  // Title mirrors the normal-mode view so it is obvious which list is shown: the
  // active filter, or the browsed date when viewing a day other than today.
  const pinTitle = activeFilter === "today" && viewDateKey !== getLocalDateKey()
    ? (() => {
        const [year, month, day] = viewDateKey.split("-").map(Number);
        const locale = language === "en-US" ? "en-US" : "zh-CN";
        return new Intl.DateTimeFormat(locale, { month: language === "en-US" ? "short" : "long", day: "numeric" })
          .format(new Date(year || 1970, (month || 1) - 1, day || 1));
      })()
    : t(`filters.${activeFilter}`);
  const [recentlyCompletedTaskIds, setRecentlyCompletedTaskIds] = useState<string[]>([]);
  const celebrationTimeoutsRef = useRef(new Map<string, number>());
  // Expand/collapse of stacks is kept LOCAL to the pin widget (default
  // collapsed) so a single tap opens a stack here without mutating the shared
  // store state or being blown open by whatever the user expanded in normal
  // mode. `false` means the user opened it in pin.
  const [pinExpandedById, setPinExpandedById] = useState<Record<string, boolean>>({});
  const handleToggleStackCollapsed = (stackId: string) => {
    setPinExpandedById((current) => ({ ...current, [stackId]: !current[stackId] }));
  };
  const pinStackViews = useMemo(
    () => stackViews
      .filter((view) => view.tasks.some((task) => !task.completed || recentlyCompletedTaskIds.includes(task.id)))
      .sort((first, second) => Number(stackHasPinnedTask(second)) - Number(stackHasPinnedTask(first)))
      .map((view) => ({ ...view, stack: { ...view.stack, collapsed: !pinExpandedById[view.stack.id] } })),
    [pinExpandedById, recentlyCompletedTaskIds, stackViews],
  );
  const openTaskCount = pinStackViews.reduce(
    (count, view) => count + view.tasks.filter((task) => !task.completed || recentlyCompletedTaskIds.includes(task.id)).length,
    0,
  );

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
      className="app-shell-bg flex h-full min-h-0 items-stretch justify-center overflow-hidden p-3"
      data-mode-transition={modeTransition ?? undefined}
      data-testid="desktop-pin-layout"
    >
      <section
        className="surface-detail flex h-full min-h-0 w-full flex-col overflow-hidden rounded-[1.75rem] border p-4"
        data-testid="desktop-pin-shell"
      >
        <header className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium uppercase text-[var(--text-faint)]">{t("mode.pin")}</p>
            <h1 className="mt-1 text-xl font-semibold tracking-normal text-[var(--text-primary)]">{pinTitle}</h1>
          </div>
          <Button
            aria-label={t("window.switchToNormal")}
            className="mode-switch-button"
            onClick={onSwitchToNormal}
            size="icon"
            variant="secondary"
          >
            <Maximize2 className="h-4 w-4" />
          </Button>
        </header>

        <QuickInput compact onAddTask={onAddTask} />

        <div className="my-3 shrink-0 text-xs text-[var(--text-faint)]">{openTaskCount}{t("sidebar.openTasks")}</div>

        <div className="min-h-0 flex-1 overflow-hidden">
          <TaskList
            compact
            limit={5}
            onSelect={onSelectTask}
            onToggle={handleToggleTask}
            onToggleStackCollapsed={handleToggleStackCollapsed}
            selectedTaskId={selectedTaskId}
            stackViews={pinStackViews}
          />
        </div>
      </section>
    </main>
  );
}
