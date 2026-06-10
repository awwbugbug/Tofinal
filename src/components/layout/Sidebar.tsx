import type { CSSProperties } from "react";
import { Inbox, ListTodo, Pin, Star } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { getTasksForFilter } from "@/stores/taskStore";
import type { Task, TaskFilter } from "@/types/task";

type SidebarProps = {
  activeFilter: TaskFilter;
  tasks: Task[];
  onFilterChange: (filter: TaskFilter) => void;
};

const navItems: Array<{
  label: string;
  icon: typeof Inbox;
  filter: TaskFilter;
}> = [
  { label: "Today", icon: Inbox, filter: "today" },
  { label: "All Tasks", icon: ListTodo, filter: "all" },
  { label: "Important", icon: Star, filter: "important" },
  { label: "Pinned", icon: Pin, filter: "pinned" },
];

const activeFilterOffsets = [
  "0px",
  "calc(var(--filter-item-height) + var(--filter-item-gap))",
  "calc((var(--filter-item-height) + var(--filter-item-gap)) + (var(--filter-item-height) + var(--filter-item-gap)))",
  "calc((var(--filter-item-height) + var(--filter-item-gap)) + (var(--filter-item-height) + var(--filter-item-gap)) + (var(--filter-item-height) + var(--filter-item-gap)))",
];

export function Sidebar({ activeFilter, onFilterChange, tasks }: SidebarProps) {
  const openCount = tasks.filter((task) => !task.completed).length;
  const activeFilterIndex = Math.max(
    navItems.findIndex((item) => item.filter === activeFilter),
    0,
  );
  const navStyle = { "--active-filter-offset": activeFilterOffsets[activeFilterIndex] } as CSSProperties;

  return (
    <aside className="surface-sidebar flex h-full flex-col rounded-[var(--radius-panel)] border p-4">
      <div className="px-2">
        <div className="text-xs font-medium uppercase text-[var(--text-faint)]">ToFinal</div>
        <h1 className="mt-2 text-2xl font-semibold tracking-normal text-[var(--text-primary)]">Tasks</h1>
      </div>

      <nav aria-label="Task filters" className="filter-nav mt-8" style={navStyle}>
        <span aria-hidden="true" className="filter-nav-thumb selected-glass-pill" />
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = item.filter === activeFilter;
          const count = getTasksForFilter(tasks, item.filter).length;

          return (
            <button
              aria-label={`${item.label} ${count}`}
              aria-pressed={isActive}
              className={cn(
                "filter-nav-item flex w-full items-center justify-between rounded-2xl border border-transparent px-3 py-2.5 text-left text-sm text-[var(--text-muted)] hover:text-[var(--accent-hover)]",
                isActive && "text-[var(--accent-hover)]",
              )}
              key={item.label}
              onClick={() => onFilterChange(item.filter)}
              type="button"
            >
              <span className="flex items-center gap-3">
                <Icon className="h-4 w-4" />
                {item.label}
              </span>
              <span className={cn("text-xs", isActive ? "text-[var(--accent)]" : "text-[var(--text-faint)]")}>
                {count}
              </span>
            </button>
          );
        })}
      </nav>

      <Separator className="my-6" />

      <div className="space-y-2 px-2">
        <p className="text-xs font-medium uppercase text-[var(--text-faint)]">Stage</p>
        <Badge>Foundation prototype</Badge>
      </div>

      <div className="mt-auto rounded-3xl border border-[var(--border-soft)] bg-[var(--accent-surface)] p-4 shadow-[var(--shadow-subtle)]">
        <p className="text-sm font-medium text-[var(--text-secondary)]">{openCount} open tasks</p>
        <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">Saved locally in this phase.</p>
      </div>
    </aside>
  );
}
