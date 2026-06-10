import { Maximize2 } from "lucide-react";

import { QuickInput } from "@/components/task/QuickInput";
import { TaskList } from "@/components/task/TaskList";
import { Button } from "@/components/ui/button";
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
  const openTasks = tasks
    .filter((task) => !task.completed)
    .sort((firstTask, secondTask) => Number(secondTask.pinned) - Number(firstTask.pinned));

  return (
    <main
      className="app-shell-bg flex h-full items-start justify-center p-3"
      data-testid="desktop-pin-layout"
    >
      <section className="surface-detail flex h-full w-full max-w-[360px] flex-col rounded-[1.75rem] border p-4">
        <header className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium uppercase text-[var(--text-faint)]">Desktop Pin Mode</p>
            <h1 className="mt-1 text-xl font-semibold tracking-normal text-[var(--text-primary)]">Quick Tasks</h1>
          </div>
          <Button aria-label="Switch to Normal Window Mode" onClick={onSwitchToNormal} size="icon" variant="secondary">
            <Maximize2 className="h-4 w-4" />
          </Button>
        </header>

        <QuickInput compact onAddTask={onAddTask} />

        <div className="my-3 text-xs text-[var(--text-faint)]">{openTasks.length} open tasks</div>

        <TaskList
          compact
          limit={5}
          onSelect={onSelectTask}
          onToggle={onToggleTask}
          selectedTaskId={selectedTaskId}
          tasks={openTasks}
        />
      </section>
    </main>
  );
}
