import { useEffect } from "react";

import { DesktopPinLayout } from "@/components/layout/DesktopPinLayout";
import { NormalModeLayout } from "@/components/layout/NormalModeLayout";
import { WindowTitleBar } from "@/components/layout/WindowTitleBar";
import { applyWindowMode } from "@/lib/windowMode";
import { useTaskStore } from "@/stores/taskStore";

export function AppShell() {
  const tasks = useTaskStore((state) => state.tasks);
  const selectedTaskId = useTaskStore((state) => state.selectedTaskId);
  const mode = useTaskStore((state) => state.mode);
  const activeFilter = useTaskStore((state) => state.activeFilter);
  const searchQuery = useTaskStore((state) => state.searchQuery);
  const addTask = useTaskStore((state) => state.addTask);
  const updateTask = useTaskStore((state) => state.updateTask);
  const deleteTask = useTaskStore((state) => state.deleteTask);
  const toggleTask = useTaskStore((state) => state.toggleTask);
  const selectTask = useTaskStore((state) => state.selectTask);
  const setMode = useTaskStore((state) => state.setMode);
  const setActiveFilter = useTaskStore((state) => state.setActiveFilter);
  const setSearchQuery = useTaskStore((state) => state.setSearchQuery);
  const getFilteredTasks = useTaskStore((state) => state.getFilteredTasks);
  const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? null;
  const filteredTasks = getFilteredTasks(activeFilter);

  useEffect(() => {
    void applyWindowMode(mode);
  }, [mode]);

  if (mode === "pin") {
    return (
      <div className="app-shell-bg flex h-screen flex-col">
        <WindowTitleBar mode={mode} />
        <div className="min-h-0 flex-1">
          <DesktopPinLayout
            onAddTask={addTask}
            onSelectTask={selectTask}
            onSwitchToNormal={() => setMode("normal")}
            onToggleTask={toggleTask}
            selectedTaskId={selectedTaskId}
            tasks={tasks}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell-bg flex h-screen flex-col">
      <WindowTitleBar mode={mode} />
      <div className="min-h-0 flex-1">
        <NormalModeLayout
          activeFilter={activeFilter}
          filteredTasks={filteredTasks}
          onAddTask={addTask}
          onDeleteTask={deleteTask}
          onFilterChange={setActiveFilter}
          onSelectTask={selectTask}
          onSearchChange={setSearchQuery}
          onSwitchToPin={() => setMode("pin")}
          onToggleTask={toggleTask}
          onUpdateTask={updateTask}
          searchQuery={searchQuery}
          selectedTask={selectedTask}
          selectedTaskId={selectedTaskId}
          tasks={tasks}
        />
      </div>
    </div>
  );
}
