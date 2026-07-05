import { type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { Layers3 } from "lucide-react";

import { TaskItem } from "@/components/task/TaskItem";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useI18n } from "@/i18n/useI18n";
import type { Task, TaskStackView } from "@/types/task";

type TaskListProps = {
  tasks?: Task[];
  stackViews?: TaskStackView[];
  selectedTaskId: string | null;
  compact?: boolean;
  embedded?: boolean;
  limit?: number;
  testId?: string;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
  onToggleStackCollapsed?: (stackId: string) => void;
  onReorderStacks?: (sourceStackId: string, targetIndex: number, visibleStackIds: string[]) => boolean;
  onReorderTaskWithinStack?: (stackId: string, taskId: string, targetIndex: number) => boolean;
  onMoveTaskToStack?: (taskId: string, targetStackId: string, targetIndex?: number) => boolean;
  onSplitTaskToNewStack?: (taskId: string, targetGlobalIndex: number, visibleStackIds: string[]) => boolean;
};

type DragState = {
  active: boolean;
  kind: "stack" | "task";
  pointerId: number;
  sourceStackId: string;
  sourceStackSize: number;
  sourceTaskId?: string;
  startX: number;
  startY: number;
};

type DropPreview =
  | { kind: "stack-reorder"; targetIndex: number }
  | { kind: "task-reorder"; targetIndex: number; targetStackId: string }
  | { kind: "merge"; targetStackId: string }
  | { kind: "split"; targetIndex: number };

type RectSnapshot = {
  id: string;
  top: number;
  height: number;
  mid: number;
  left: number;
  right: number;
};

type DragMeasurements = {
  stacks: RectSnapshot[];
  tasks: RectSnapshot[];
  stackGap: number;
  taskGap: number;
  draggedStackHeight: number;
  draggedTaskHeight: number;
  scrollParent: HTMLElement | null;
  scrollTop: number;
};

const DRAG_START_THRESHOLD = 6;
const DEFAULT_STACK_GAP = 16;
const DEFAULT_TASK_GAP = 9;
// Fraction of a card's height near its top/bottom edge that resolves to
// insertion instead of merge while dragging a task over another stack.
const MERGE_EDGE_FRACTION = 0.28;

const isInteractiveElement = (target: EventTarget | null, currentTarget?: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const interactiveElement = target.closest("button, input, textarea, select, a, [role='button'], [data-no-drag='true']");
  if (!interactiveElement) {
    return false;
  }

  return interactiveElement !== currentTarget;
};

const getInsertionIndex = (rects: RectSnapshot[], pointerY: number) => {
  let targetIndex = 0;
  rects.forEach((rect, index) => {
    if (pointerY > rect.mid) {
      targetIndex = index + 1;
    }
  });
  return targetIndex;
};

const toRectSnapshot = (element: HTMLElement, id: string): RectSnapshot => {
  const rect = element.getBoundingClientRect();
  return {
    id,
    top: rect.top,
    height: rect.height,
    mid: rect.top + rect.height / 2,
    left: rect.left,
    right: rect.right,
  };
};

const getFirstPositiveGap = (rects: RectSnapshot[], fallback: number) => {
  for (let index = 1; index < rects.length; index += 1) {
    const gap = rects[index].top - (rects[index - 1].top + rects[index - 1].height);
    if (gap > 0) {
      return gap;
    }
  }
  return fallback;
};

const getScrollParent = (element: HTMLElement | null): HTMLElement | null => {
  let node = element?.parentElement ?? null;
  while (node) {
    if (/(auto|scroll)/.test(window.getComputedStyle(node).overflowY)) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
};

export function TaskList({
  compact = false,
  embedded = false,
  limit,
  onMoveTaskToStack,
  onReorderStacks,
  onReorderTaskWithinStack,
  onSelect,
  onSplitTaskToNewStack,
  onToggle,
  onToggleStackCollapsed,
  selectedTaskId,
  stackViews,
  tasks = [],
  testId = "task-list",
}: TaskListProps) {
  const { t } = useI18n();
  const listRef = useRef<HTMLDivElement | null>(null);
  const suppressClickRef = useRef(false);
  const dragStateRef = useRef<DragState | null>(null);
  const dropPreviewRef = useRef<DropPreview | null>(null);
  const measurementsRef = useRef<DragMeasurements | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dropPreview, setDropPreview] = useState<DropPreview | null>(null);
  const [dragDelta, setDragDelta] = useState<{ x: number; y: number } | null>(null);
  const views = stackViews ?? tasks.map((task, index) => ({
    stack: {
      id: task.stackId,
      sortOrder: index,
      collapsed: true,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    },
    tasks: [task],
    mainTask: task,
    completedCount: task.completed ? 1 : 0,
    totalCount: 1,
    todayRelevantCount: 0,
  } satisfies TaskStackView));
  const visibleViews = typeof limit === "number" ? views.slice(0, limit) : views;
  const visibleStackIds = useMemo(() => visibleViews.map((view) => view.stack.id), [visibleViews]);
  const dragEnabled = !compact && Boolean(onReorderStacks || onMoveTaskToStack || onReorderTaskWithinStack || onSplitTaskToNewStack);

  useEffect(() => {
    dragStateRef.current = dragState;
  }, [dragState]);

  useEffect(() => {
    dropPreviewRef.current = dropPreview;
  }, [dropPreview]);

  const resetDrag = () => {
    dragStateRef.current = null;
    dropPreviewRef.current = null;
    measurementsRef.current = null;
    setDragState(null);
    setDropPreview(null);
    setDragDelta(null);
  };

  const getStackFrames = () =>
    Array.from(listRef.current?.querySelectorAll<HTMLElement>("[data-dnd-stack-frame='true']") ?? []);

  const captureMeasurements = (drag: DragState): DragMeasurements => {
    const stacks = getStackFrames().map((frame) => toRectSnapshot(frame, frame.dataset.stackId ?? ""));
    const taskFrames = drag.kind === "task"
      ? Array.from(
          listRef.current?.querySelectorAll<HTMLElement>(`[data-dnd-task-frame='true'][data-stack-id="${drag.sourceStackId}"]`) ?? [],
        )
      : [];
    const taskRects = taskFrames.map((frame) => toRectSnapshot(frame, frame.dataset.taskId ?? ""));
    const draggedStackHeight = stacks.find((rect) => rect.id === drag.sourceStackId)?.height ?? 0;
    const draggedTaskHeight = taskRects.find((rect) => rect.id === drag.sourceTaskId)?.height ?? draggedStackHeight;
    const scrollParent = getScrollParent(listRef.current);

    return {
      stacks,
      tasks: taskRects,
      stackGap: getFirstPositiveGap(stacks, DEFAULT_STACK_GAP),
      taskGap: getFirstPositiveGap(taskRects, DEFAULT_TASK_GAP),
      draggedStackHeight,
      draggedTaskHeight,
      scrollParent,
      scrollTop: scrollParent?.scrollTop ?? 0,
    };
  };

  // All drag geometry works in the coordinate space captured at drag start, so
  // push-apart transforms on siblings never feed back into hit testing.
  const resolveDropPreview = (drag: DragState, clientX: number, clientY: number): DropPreview | null => {
    const measurements = measurementsRef.current;
    if (!measurements) {
      return null;
    }

    const scrollDelta = (measurements.scrollParent?.scrollTop ?? 0) - measurements.scrollTop;
    const pointerY = clientY + scrollDelta;
    const targetIndex = getInsertionIndex(measurements.stacks, pointerY);

    if (drag.kind === "task") {
      const sourceStackRect = measurements.stacks.find((rect) => rect.id === drag.sourceStackId);
      if (
        measurements.tasks.length > 1 &&
        sourceStackRect &&
        pointerY >= sourceStackRect.top &&
        pointerY <= sourceStackRect.top + sourceStackRect.height
      ) {
        return {
          kind: "task-reorder",
          targetIndex: getInsertionIndex(measurements.tasks, pointerY),
          targetStackId: drag.sourceStackId,
        };
      }

      const mergeTarget = measurements.stacks.find((rect) => {
        if (rect.id === drag.sourceStackId || rect.height <= 0) {
          return false;
        }
        const edge = rect.height * MERGE_EDGE_FRACTION;
        return (
          clientX >= rect.left &&
          clientX <= rect.right &&
          pointerY >= rect.top + edge &&
          pointerY <= rect.top + rect.height - edge
        );
      });
      if (mergeTarget) {
        return { kind: "merge", targetStackId: mergeTarget.id };
      }

      if (drag.sourceStackSize > 1) {
        return { kind: "split", targetIndex };
      }

      return { kind: "stack-reorder", targetIndex };
    }

    return { kind: "stack-reorder", targetIndex };
  };

  const beginDrag = (
    event: ReactPointerEvent,
    drag: Pick<DragState, "kind" | "sourceStackId" | "sourceStackSize" | "sourceTaskId">,
  ) => {
    if (!dragEnabled || event.button !== 0 || isInteractiveElement(event.target, event.currentTarget)) {
      return;
    }

    const nextDragState = {
      ...drag,
      active: false,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
    };
    dragStateRef.current = nextDragState;
    setDragState(nextDragState);
  };

  const handleDrop = (drag: DragState, preview: DropPreview | null) => {
    if (!preview) {
      return;
    }

    if (preview.kind === "stack-reorder") {
      if (drag.kind === "task" && drag.sourceStackSize > 1) {
        onSplitTaskToNewStack?.(drag.sourceTaskId ?? "", preview.targetIndex, visibleStackIds);
        return;
      }

      onReorderStacks?.(drag.sourceStackId, preview.targetIndex, visibleStackIds);
      return;
    }

    if (preview.kind === "task-reorder") {
      onReorderTaskWithinStack?.(preview.targetStackId, drag.sourceTaskId ?? "", preview.targetIndex);
      return;
    }

    if (preview.kind === "merge") {
      onMoveTaskToStack?.(drag.sourceTaskId ?? "", preview.targetStackId);
      return;
    }

    onSplitTaskToNewStack?.(drag.sourceTaskId ?? "", preview.targetIndex, visibleStackIds);
  };

  useEffect(() => {
    if (!dragState) {
      return undefined;
    }

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerId !== dragState.pointerId) {
        return;
      }

      const distance = Math.hypot(event.clientX - dragState.startX, event.clientY - dragState.startY);
      if (!dragState.active && distance < DRAG_START_THRESHOLD) {
        return;
      }

      event.preventDefault();
      suppressClickRef.current = true;
      const nextDragState = dragState.active ? dragState : { ...dragState, active: true };
      if (!dragState.active) {
        measurementsRef.current = captureMeasurements(nextDragState);
        setDragState(nextDragState);
        dragStateRef.current = nextDragState;
      }
      setDragDelta({ x: event.clientX - dragState.startX, y: event.clientY - dragState.startY });
      const nextDropPreview = resolveDropPreview(nextDragState, event.clientX, event.clientY);
      dropPreviewRef.current = nextDropPreview;
      setDropPreview(nextDropPreview);
    };

    const handlePointerUp = (event: PointerEvent) => {
      const latestDragState = dragStateRef.current;
      if (!latestDragState || event.pointerId !== latestDragState.pointerId) {
        return;
      }

      if (latestDragState.active) {
        event.preventDefault();
        handleDrop(latestDragState, dropPreviewRef.current);
      }
      resetDrag();
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
    };

    const handlePointerCancel = (event: PointerEvent) => {
      if (event.pointerId !== dragState.pointerId) {
        return;
      }

      resetDrag();
      suppressClickRef.current = false;
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerCancel);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerCancel);
    };
  }, [dragState, dropPreview, onMoveTaskToStack, onReorderStacks, onReorderTaskWithinStack, onSplitTaskToNewStack, visibleStackIds]);

  const suppressClickAfterDrag = (event: ReactMouseEvent) => {
    if (!suppressClickRef.current) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
  };

  const toggleCollapsedStackFromKey = (event: ReactKeyboardEvent, stackId: string) => {
    if (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) {
      return;
    }

    event.preventDefault();
    onToggleStackCollapsed?.(stackId);
  };

  // Push-apart offsets derived from the snapshot geometry and the live drop
  // preview. Transforms only; layout never changes while dragging.
  const activeDrag = dragState?.active ? dragState : null;
  const measurements = activeDrag ? measurementsRef.current : null;
  const stackShifts = new Map<string, number>();
  const taskShifts = new Map<string, number>();
  if (activeDrag && dropPreview && measurements) {
    if (dropPreview.kind === "stack-reorder") {
      const sourceIndex = measurements.stacks.findIndex((rect) => rect.id === activeDrag.sourceStackId);
      if (sourceIndex !== -1) {
        const targetSlot = dropPreview.targetIndex > sourceIndex ? dropPreview.targetIndex - 1 : dropPreview.targetIndex;
        const offset = measurements.draggedStackHeight + measurements.stackGap;
        measurements.stacks.forEach((rect, index) => {
          if (targetSlot > sourceIndex && index > sourceIndex && index <= targetSlot) {
            stackShifts.set(rect.id, -offset);
          } else if (targetSlot < sourceIndex && index >= targetSlot && index < sourceIndex) {
            stackShifts.set(rect.id, offset);
          }
        });
      }
    } else if (dropPreview.kind === "split") {
      const offset = measurements.draggedTaskHeight + measurements.stackGap;
      measurements.stacks.forEach((rect, index) => {
        if (index >= dropPreview.targetIndex) {
          stackShifts.set(rect.id, offset);
        }
      });
    } else if (dropPreview.kind === "task-reorder") {
      const sourceIndex = measurements.tasks.findIndex((rect) => rect.id === activeDrag.sourceTaskId);
      if (sourceIndex !== -1) {
        const targetSlot = dropPreview.targetIndex > sourceIndex ? dropPreview.targetIndex - 1 : dropPreview.targetIndex;
        const offset = measurements.draggedTaskHeight + measurements.taskGap;
        measurements.tasks.forEach((rect, index) => {
          if (targetSlot > sourceIndex && index > sourceIndex && index <= targetSlot) {
            taskShifts.set(rect.id, -offset);
          } else if (targetSlot < sourceIndex && index >= targetSlot && index < sourceIndex) {
            taskShifts.set(rect.id, offset);
          }
        });
      }
    }
  }

  const buildFrameStyle = (dragging: boolean, shift: number): CSSProperties | undefined => {
    if (dragging && dragDelta) {
      return {
        transform: `translate3d(${dragDelta.x}px, ${dragDelta.y}px, 0) scale(1.02)`,
        transition: "none",
        zIndex: 30,
      };
    }
    if (shift !== 0) {
      return { transform: `translate3d(0, ${shift}px, 0)` };
    }
    return undefined;
  };

  const renderStackMeta = (view: TaskStackView) => {
    if (view.totalCount <= 1) {
      return null;
    }

    return (
      <div className="mt-2 flex items-center justify-between gap-2 px-2 text-[11px] text-[var(--text-faint)]">
        <span className="inline-flex items-center gap-1">
          <Layers3 className="h-3 w-3" />
          {view.totalCount - 1} {t("stack.subtasks")}
        </span>
        <span>{view.completedCount}/{view.totalCount}</span>
      </div>
    );
  };

  const renderStack = (view: TaskStackView) => {
    const isSingleton = view.totalCount === 1;
    const isCollapsed = view.stack.collapsed || compact;
    const stackDropState = dropPreview?.kind === "merge" && dropPreview.targetStackId === view.stack.id ? "merge" : undefined;
    const topLevelDragging = Boolean(
      activeDrag &&
      activeDrag.sourceStackId === view.stack.id &&
      (activeDrag.kind === "stack" || activeDrag.sourceStackSize === 1),
    );
    const stackShift = stackShifts.get(view.stack.id) ?? 0;
    const collapsedMultiStack = !isSingleton && isCollapsed && !compact;

    if (isSingleton || isCollapsed) {
      return (
        <div
          aria-label={collapsedMultiStack ? t("stack.expand") : undefined}
          className={collapsedMultiStack ? "task-stack-shell task-stack-drag-frame task-stack-collapsed-multi" : "task-stack-shell task-stack-drag-frame"}
          data-dnd-stack-frame="true"
          data-dragging={topLevelDragging ? "true" : undefined}
          data-drop-state={stackDropState}
          data-stack-size={collapsedMultiStack ? "multi" : "single"}
          data-stack-id={view.stack.id}
          data-testid="task-stack"
          key={view.stack.id}
          onClickCapture={suppressClickAfterDrag}
          onDoubleClick={collapsedMultiStack ? (event) => {
            if (!isInteractiveElement(event.target, event.currentTarget)) {
              onToggleStackCollapsed?.(view.stack.id);
            }
          } : undefined}
          onKeyDown={collapsedMultiStack ? (event) => toggleCollapsedStackFromKey(event, view.stack.id) : undefined}
          onPointerDown={(event) => beginDrag(event, {
            kind: isSingleton ? "task" : "stack",
            sourceStackId: view.stack.id,
            sourceStackSize: view.totalCount,
            sourceTaskId: view.mainTask.id,
          })}
          role={collapsedMultiStack ? "button" : undefined}
          style={buildFrameStyle(topLevelDragging, stackShift)}
          tabIndex={collapsedMultiStack ? 0 : undefined}
        >
          <TaskItem
            compact={compact}
            onSelect={onSelect}
            onToggle={onToggle}
            selected={!compact && view.mainTask.id === selectedTaskId}
            stackCount={collapsedMultiStack ? view.totalCount : undefined}
            task={view.mainTask}
          />
          {!collapsedMultiStack && renderStackMeta(view)}
        </div>
      );
    }

    const mainTaskDragging = Boolean(
      activeDrag &&
      activeDrag.kind === "task" &&
      activeDrag.sourceTaskId === view.mainTask.id &&
      activeDrag.sourceStackSize > 1,
    );

    return (
      <section
        className="task-stack-unfolded task-stack-drag-frame"
        data-dnd-stack-frame="true"
        data-dragging={topLevelDragging ? "true" : undefined}
        data-drop-state={stackDropState}
        data-stack-id={view.stack.id}
        data-testid="task-stack-expanded"
        key={view.stack.id}
        onClickCapture={suppressClickAfterDrag}
        onPointerDown={(event) => beginDrag(event, {
          kind: "stack",
          sourceStackId: view.stack.id,
          sourceStackSize: view.totalCount,
        })}
        style={buildFrameStyle(topLevelDragging, stackShift)}
      >
        <div
          aria-label={t("stack.collapse")}
          className="task-stack-main-frame"
          data-dnd-task-frame="true"
          data-dragging={mainTaskDragging ? "true" : undefined}
          data-stack-id={view.stack.id}
          data-task-id={view.mainTask.id}
          onDoubleClick={(event) => {
            if (!isInteractiveElement(event.target, event.currentTarget)) {
              onToggleStackCollapsed?.(view.stack.id);
            }
          }}
          onKeyDown={(event) => toggleCollapsedStackFromKey(event, view.stack.id)}
          onPointerDown={(event) => {
            event.stopPropagation();
            beginDrag(event, {
              kind: "task",
              sourceStackId: view.stack.id,
              sourceStackSize: view.totalCount,
              sourceTaskId: view.mainTask.id,
            });
          }}
          role="button"
          style={buildFrameStyle(mainTaskDragging, taskShifts.get(view.mainTask.id) ?? 0)}
          tabIndex={0}
        >
          <TaskItem
            onSelect={onSelect}
            onToggle={onToggle}
            selected={!compact && view.mainTask.id === selectedTaskId}
            stackCount={view.totalCount}
            task={view.mainTask}
          />
        </div>
        <div className="task-stack-unfold-panel">
          {view.tasks.slice(1).map((task) => {
            const taskDragging = Boolean(
              activeDrag &&
              activeDrag.kind === "task" &&
              activeDrag.sourceTaskId === task.id &&
              activeDrag.sourceStackSize > 1,
            );
            return (
              <div
                className="stack-task-drag-frame"
                data-dnd-task-frame="true"
                data-dragging={taskDragging ? "true" : undefined}
                data-stack-id={view.stack.id}
                data-task-id={task.id}
                key={task.id}
                onClickCapture={suppressClickAfterDrag}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  beginDrag(event, {
                    kind: "task",
                    sourceStackId: view.stack.id,
                    sourceStackSize: view.totalCount,
                    sourceTaskId: task.id,
                  });
                }}
                style={buildFrameStyle(taskDragging, taskShifts.get(task.id) ?? 0)}
              >
                <TaskItem
                  onSelect={onSelect}
                  onToggle={onToggle}
                  selected={!compact && task.id === selectedTaskId}
                  subtask
                  task={task}
                />
              </div>
            );
          })}
        </div>
      </section>
    );
  };

  const list = (
    <div
      className={compact ? "task-card-list-safe-area-compact space-y-2" : "task-card-list-safe-area space-y-4"}
      data-testid={testId}
      ref={listRef}
    >
      {visibleViews.map(renderStack)}
    </div>
  );

  if (embedded) {
    return list;
  }

  return (
    <ScrollArea className={compact ? "-mx-3 h-full min-h-0 px-3 py-1" : "-mx-5 min-h-0 flex-1 px-4 py-1"}>
      {list}
    </ScrollArea>
  );
}
