import { type CSSProperties, useState } from "react";
import { CalendarDays, Inbox, ListTodo, Pin, Settings, Star } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PreferencesPanel } from "@/components/layout/PreferencesPanel";
import { Separator } from "@/components/ui/separator";
import { TrashBinIcon } from "@/components/ui/trash-bin-icon";
import { useI18n } from "@/i18n/useI18n";
import { cn } from "@/lib/utils";
import { useSegmentDrag } from "@/lib/useSegmentDrag";
import { useDragStore } from "@/stores/dragStore";
import { usePreferencesStore } from "@/stores/preferencesStore";
import { getLocalDateKey, getOverdueTasks, getTasksForFilter } from "@/stores/taskStore";
import type { Task, TaskFilter } from "@/types/task";

type SidebarProps = {
  activeFilter: TaskFilter;
  tasks: Task[];
  trashedCount: number;
  viewDateKey: string;
  onFilterChange: (filter: TaskFilter) => void;
  onOpenTrash: () => void;
};

const navItems: Array<{
  labelKey: string;
  icon: typeof Inbox;
  filter: TaskFilter;
}> = [
  { labelKey: "filters.today", icon: Inbox, filter: "today" },
  { labelKey: "filters.all", icon: ListTodo, filter: "all" },
  { labelKey: "filters.important", icon: Star, filter: "important" },
  { labelKey: "filters.pinned", icon: Pin, filter: "pinned" },
];

const activeFilterOffsets = [
  "0px",
  "calc(var(--filter-item-height) + var(--filter-item-gap))",
  "calc((var(--filter-item-height) + var(--filter-item-gap)) + (var(--filter-item-height) + var(--filter-item-gap)))",
  "calc((var(--filter-item-height) + var(--filter-item-gap)) + (var(--filter-item-height) + var(--filter-item-gap)) + (var(--filter-item-height) + var(--filter-item-gap)))",
];

export function Sidebar({ activeFilter, onFilterChange, onOpenTrash, tasks, trashedCount, viewDateKey }: SidebarProps) {
  const { t } = useI18n();
  const language = usePreferencesStore((state) => state.language);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const isViewingToday = viewDateKey === getLocalDateKey();
  const overDropTarget = useDragStore((state) => state.overDropTarget);
  const pulseDropTarget = useDragStore((state) => state.pulseDropTarget);
  const clearPulse = useDragStore((state) => state.clearPulse);
  const openCount = tasks.filter((task) => !task.completed && !task.deletedAt).length;
  const activeFilterIndex = Math.max(
    navItems.findIndex((item) => item.filter === activeFilter),
    0,
  );
  const navStyle = { "--active-filter-offset": activeFilterOffsets[activeFilterIndex] } as CSSProperties;
  const filterDrag = useSegmentDrag({
    orientation: "vertical",
    onSelectIndex: (index) => {
      const item = navItems[index];
      if (item) {
        onFilterChange(item.filter);
      }
    },
  });

  return (
    <aside className="surface-sidebar flex h-full flex-col rounded-[var(--radius-panel)] border p-4">
      <div className="px-2">
        <div className="text-xs font-medium uppercase text-[var(--text-faint)]">ToFinal</div>
        <h1 className="mt-2 text-2xl font-semibold tracking-normal text-[var(--text-primary)]">{t("sidebar.tasks")}</h1>
      </div>

      <nav aria-label="Task filters" className="filter-nav mt-8 touch-none" style={navStyle} {...filterDrag}>
        <span aria-hidden="true" className="filter-nav-thumb glass-soft selected-glass-pill" />
        {navItems.map((item) => {
          const isDateItem = item.filter === "today";
          // The date item follows the selected view date: label, icon, and
          // drop target all point at that date.
          const Icon = isDateItem && !isViewingToday ? CalendarDays : item.icon;
          const isActive = item.filter === activeFilter;
          const count = getTasksForFilter(tasks, item.filter, viewDateKey).length
            + (isDateItem && isViewingToday ? getOverdueTasks(tasks).length : 0);
          const label = isDateItem && !isViewingToday
            ? (() => {
                const [year, month, day] = viewDateKey.split("-").map(Number);
                const locale = language === "en-US" ? "en-US" : "zh-CN";
                return new Intl.DateTimeFormat(locale, { month: language === "en-US" ? "short" : "long", day: "numeric" })
                  .format(new Date(year || 1970, (month || 1) - 1, day || 1));
              })()
            : t(item.labelKey);

          return (
            <button
              aria-label={`${label} ${count}`}
              aria-pressed={isActive}
              className={cn(
                "filter-nav-item flex w-full items-center justify-between rounded-2xl border border-transparent px-3 py-2.5 text-left text-sm text-[var(--text-muted)] hover:text-[var(--accent-hover)]",
                isActive && "text-[var(--accent-hover)]",
                overDropTarget === item.filter && "filter-nav-item-drop-active",
                pulseDropTarget === item.filter && "filter-nav-item-drop-pulse",
              )}
              data-drop-target={item.filter}
              data-segment-button
              key={item.filter}
              onAnimationEnd={pulseDropTarget === item.filter ? clearPulse : undefined}
              onClick={() => onFilterChange(item.filter)}
              type="button"
            >
              <span className="flex items-center gap-3">
                <Icon className="h-4 w-4" />
                {label}
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
        <p className="text-xs font-medium uppercase text-[var(--text-faint)]">{t("sidebar.stage")}</p>
        <Badge>{t("sidebar.foundationPrototype")}</Badge>
      </div>

      <div className="mt-auto space-y-3">
        <button
          aria-label={t("trash.open")}
          className={cn(
            "trash-bin-trigger",
            overDropTarget === "trash" && "trash-bin-trigger-drop-active",
            pulseDropTarget === "trash" && "filter-nav-item-drop-pulse",
          )}
          data-drop-target="trash"
          onAnimationEnd={pulseDropTarget === "trash" ? clearPulse : undefined}
          onClick={onOpenTrash}
          title={t("trash.title")}
          type="button"
        >
          <TrashBinIcon className="h-6 w-6" open={overDropTarget === "trash"} />
          {trashedCount > 0 && <span className="trash-bin-count">{trashedCount}</span>}
        </button>
        <Button
          aria-label={t("settings.open")}
          className="w-full justify-start"
          onClick={() => setPreferencesOpen(true)}
          type="button"
          variant="secondary"
        >
          <Settings className="h-4 w-4" />
          {t("settings.title")}
        </Button>
        <div className="rounded-3xl border border-[var(--border-soft)] bg-[var(--accent-surface)] p-4 shadow-[var(--shadow-subtle)]">
          <p className="text-sm font-medium text-[var(--text-secondary)]">{openCount}{t("sidebar.openTasks")}</p>
          <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">{t("sidebar.savedLocally")}</p>
        </div>
      </div>
      <PreferencesPanel open={preferencesOpen} onClose={() => setPreferencesOpen(false)} />
    </aside>
  );
}
