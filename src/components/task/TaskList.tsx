import { type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Layers3 } from "lucide-react";

import { TaskItem } from "@/components/task/TaskItem";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useI18n } from "@/i18n/useI18n";
import { cn } from "@/lib/utils";
import { useDragStore, type DropTargetId } from "@/stores/dragStore";
import type { Task, TaskFilter, TaskStackView } from "@/types/task";

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
  onSidebarDrop?: (taskIds: string[], target: TaskFilter) => boolean;
  onDropToTrash?: (taskIds: string[]) => void;
  leavingTaskIds?: string[];
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

type DragSource = Pick<DragState, "kind" | "sourceStackId" | "sourceStackSize" | "sourceTaskId">;

type DropPreview =
  | { kind: "stack-reorder"; targetIndex: number }
  | { kind: "task-reorder"; targetIndex: number; targetStackId: string }
  | { kind: "merge"; targetStackId: string }
  | { kind: "split"; targetIndex: number }
  | { kind: "sidebar"; target: DropTargetId };

type RectSnapshot = {
  id: string;
  top: number;
  height: number;
  mid: number;
  left: number;
  right: number;
};

type SidebarTargetRect = {
  target: DropTargetId;
  left: number;
  top: number;
  right: number;
  bottom: number;
};

type DragMeasurements = {
  stacks: RectSnapshot[];
  tasks: RectSnapshot[];
  sidebarTargets: SidebarTargetRect[];
  stackGap: number;
  taskGap: number;
  draggedStackHeight: number;
  draggedTaskHeight: number;
  draggedRect: { left: number; top: number; width: number; height: number };
  scrollParent: HTMLElement | null;
  scrollTop: number;
};

type GhostContent = {
  task: Task;
  stackCount?: number;
  subtask: boolean;
  collapsedMulti: boolean;
};

type GhostExitState = {
  drag: DragSource;
  content: GhostContent;
  left: number;
  top: number;
  width: number;
  mode: "return" | "absorb";
  exitX: number;
  exitY: number;
  exitScale: number;
  exitOpacity: number;
};

const DRAG_START_THRESHOLD = 6;
const DEFAULT_STACK_GAP = 16;
const DEFAULT_TASK_GAP = 9;
const GHOST_EXIT_MS = 260;
const UNFOLD_STAGGER_MS = 50;
const UNFOLD_STAGGER_CAP_MS = 300;
const FOLD_MS = 240;
const FOLD_STAGGER_MS = 40;
const FOLD_STAGGER_CAP_MS = 240;
// Fraction of a card's height near its top/bottom edge that resolves to
// insertion instead of merge while dragging a task over another stack.
const MERGE_EDGE_FRACTION = 0.28;

const noop = () => undefined;

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

const dragHidesTopLevel = (drag: DragSource | null, stackId: string) =>
  Boolean(drag && drag.sourceStackId === stackId && (drag.kind === "stack" || drag.sourceStackSize === 1));

const dragHidesTask = (drag: DragSource | null, taskId: string) =>
  Boolean(drag && drag.kind === "task" && drag.sourceTaskId === taskId && drag.sourceStackSize > 1);


export function TaskList({
  compact = false,
  embedded = false,
  leavingTaskIds = [],
  limit,
  onDropToTrash,
  onMoveTaskToStack,
  onReorderStacks,
  onReorderTaskWithinStack,
  onSelect,
  onSidebarDrop,
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
  const ghostContentRef = useRef<GhostContent | null>(null);
  const dragDeltaRef = useRef<{ x: number; y: number } | null>(null);
  const ghostExitTimeoutRef = useRef<number | null>(null);
  const bodyDragStyleRef = useRef<{ userSelect: string; cursor: string } | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dropPreview, setDropPreview] = useState<DropPreview | null>(null);
  const [dragDelta, setDragDelta] = useState<{ x: number; y: number } | null>(null);
  const [ghostExit, setGhostExit] = useState<GhostExitState | null>(null);
  const [collapsingStackIds, setCollapsingStackIds] = useState<string[]>([]);
  const collapseTimeoutsRef = useRef<Set<number>>(new Set());
  const overDropTarget = useDragStore((state) => state.overDropTarget);
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
  const dragEnabled = !compact && Boolean(onReorderStacks || onMoveTaskToStack || onReorderTaskWithinStack || onSplitTaskToNewStack || onSidebarDrop || onDropToTrash);

  useEffect(() => {
    dragStateRef.current = dragState;
  }, [dragState]);

  useEffect(() => {
    dropPreviewRef.current = dropPreview;
  }, [dropPreview]);

  useEffect(() => () => {
    if (ghostExitTimeoutRef.current !== null) {
      window.clearTimeout(ghostExitTimeoutRef.current);
    }
    collapseTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
    collapseTimeoutsRef.current.clear();
    if (bodyDragStyleRef.current) {
      document.body.style.userSelect = bodyDragStyleRef.current.userSelect;
      document.body.style.cursor = bodyDragStyleRef.current.cursor;
      bodyDragStyleRef.current = null;
    }
  }, []);

  // Text selection is driven by mouse events, not pointer events, so
  // preventDefault on pointermove does not stop the browser from sweeping a
  // selection across the app while dragging. Disable selection globally for
  // the duration of the drag instead (same pattern as the column resizers).
  const lockBodyForDrag = () => {
    if (bodyDragStyleRef.current) {
      return;
    }
    bodyDragStyleRef.current = {
      userSelect: document.body.style.userSelect,
      cursor: document.body.style.cursor,
    };
    document.body.style.userSelect = "none";
    document.body.style.cursor = "grabbing";
    window.getSelection()?.removeAllRanges();
  };

  const unlockBodyAfterDrag = () => {
    if (!bodyDragStyleRef.current) {
      return;
    }
    document.body.style.userSelect = bodyDragStyleRef.current.userSelect;
    document.body.style.cursor = bodyDragStyleRef.current.cursor;
    bodyDragStyleRef.current = null;
  };

  const resetDrag = () => {
    dragStateRef.current = null;
    dropPreviewRef.current = null;
    measurementsRef.current = null;
    ghostContentRef.current = null;
    dragDeltaRef.current = null;
    setDragState(null);
    setDropPreview(null);
    setDragDelta(null);
    useDragStore.getState().setOverDropTarget(null);
    unlockBodyAfterDrag();
  };

  const scheduleGhostExitCleanup = () => {
    if (ghostExitTimeoutRef.current !== null) {
      window.clearTimeout(ghostExitTimeoutRef.current);
    }
    ghostExitTimeoutRef.current = window.setTimeout(() => {
      ghostExitTimeoutRef.current = null;
      setGhostExit(null);
    }, GHOST_EXIT_MS + 40);
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
    const sidebarTargets = onSidebarDrop || onDropToTrash
      ? Array.from(document.querySelectorAll<HTMLElement>("[data-drop-target]")).flatMap<SidebarTargetRect>((element) => {
          const target = element.dataset.dropTarget as DropTargetId;
          if ((target === "trash" && !onDropToTrash) || (target !== "trash" && !onSidebarDrop)) {
            return [];
          }
          const rect = element.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) {
            return [];
          }
          return [{
            target,
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
          }];
        })
      : [];
    const draggedStackRect = stacks.find((rect) => rect.id === drag.sourceStackId);
    const draggedTaskRect = taskRects.find((rect) => rect.id === drag.sourceTaskId);
    const draggedSource = (drag.kind === "task" ? draggedTaskRect : undefined) ?? draggedStackRect;
    const scrollParent = getScrollParent(listRef.current);

    return {
      stacks,
      tasks: taskRects,
      sidebarTargets,
      stackGap: getFirstPositiveGap(stacks, DEFAULT_STACK_GAP),
      taskGap: getFirstPositiveGap(taskRects, DEFAULT_TASK_GAP),
      draggedStackHeight: draggedStackRect?.height ?? 0,
      draggedTaskHeight: draggedTaskRect?.height ?? draggedStackRect?.height ?? 0,
      draggedRect: draggedSource
        ? { left: draggedSource.left, top: draggedSource.top, width: draggedSource.right - draggedSource.left, height: draggedSource.height }
        : { left: 0, top: 0, width: 0, height: 0 },
      scrollParent,
      scrollTop: scrollParent?.scrollTop ?? 0,
    };
  };

  const captureGhostContent = (drag: DragState): GhostContent | null => {
    const view = visibleViews.find((candidate) => candidate.stack.id === drag.sourceStackId);
    if (!view) {
      return null;
    }

    const task = drag.kind === "task"
      ? view.tasks.find((candidate) => candidate.id === drag.sourceTaskId) ?? view.mainTask
      : view.mainTask;
    const collapsedMulti = drag.kind === "stack" && view.totalCount > 1;

    return {
      task,
      stackCount: collapsedMulti ? view.totalCount : undefined,
      subtask: drag.kind === "task" && drag.sourceStackSize > 1 && task.id !== view.mainTask.id,
      collapsedMulti,
    };
  };

  const taskIdsForDrag = (drag: DragSource): string[] => {
    if (drag.kind === "task") {
      return drag.sourceTaskId ? [drag.sourceTaskId] : [];
    }

    const view = visibleViews.find((candidate) => candidate.stack.id === drag.sourceStackId);
    return view ? view.tasks.map((task) => task.id) : [];
  };

  // All drag geometry works in the coordinate space captured at drag start, so
  // push-apart transforms on siblings never feed back into hit testing.
  // Sidebar targets are checked in raw viewport coordinates (the sidebar does
  // not scroll with the task list).
  const resolveDropPreview = (drag: DragState, clientX: number, clientY: number): DropPreview | null => {
    const measurements = measurementsRef.current;
    if (!measurements) {
      return null;
    }

    const sidebarTarget = measurements.sidebarTargets.find((rect) =>
      clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom,
    );
    if (sidebarTarget) {
      return { kind: "sidebar", target: sidebarTarget.target };
    }

    const scrollDelta = (measurements.scrollParent?.scrollTop ?? 0) - measurements.scrollTop;
    const pointerY = clientY + scrollDelta;
    const targetIndex = getInsertionIndex(measurements.stacks, pointerY);

    if (drag.kind === "task") {
      const sourceStackRect = measurements.stacks.find((rect) => rect.id === drag.sourceStackId);
      if (
        onReorderTaskWithinStack &&
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

      const mergeTarget = onMoveTaskToStack
        ? measurements.stacks.find((rect) => {
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
          })
        : undefined;
      if (mergeTarget) {
        return { kind: "merge", targetStackId: mergeTarget.id };
      }

      if (drag.sourceStackSize > 1) {
        return onSplitTaskToNewStack ? { kind: "split", targetIndex } : null;
      }

      return onReorderStacks ? { kind: "stack-reorder", targetIndex } : null;
    }

    return onReorderStacks ? { kind: "stack-reorder", targetIndex } : null;
  };

  const beginDrag = (event: ReactPointerEvent, drag: DragSource) => {
    if (!dragEnabled || event.button !== 0 || isInteractiveElement(event.target, event.currentTarget)) {
      return;
    }

    if (ghostExitTimeoutRef.current !== null) {
      window.clearTimeout(ghostExitTimeoutRef.current);
      ghostExitTimeoutRef.current = null;
      setGhostExit(null);
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

  // Insertion indexes are computed over the snapshot INCLUDING the dragged
  // item, but the store splices after removing it. When the source sits
  // before the target (dragging downward) the raw index lands one slot past
  // the visual gap, so it is converted to a post-removal index here — the
  // same adjustment the push-apart offsets use.
  const toPostRemovalIndex = (targetIndex: number, sourceIndex: number) =>
    sourceIndex >= 0 && targetIndex > sourceIndex ? targetIndex - 1 : targetIndex;

  const handleDrop = (drag: DragState, preview: DropPreview | null) => {
    if (!preview || preview.kind === "sidebar") {
      return;
    }

    if (preview.kind === "stack-reorder") {
      if (drag.kind === "task" && drag.sourceStackSize > 1) {
        // Splitting inserts a brand-new stack; nothing is removed from the
        // visible list, so the raw index is already correct.
        onSplitTaskToNewStack?.(drag.sourceTaskId ?? "", preview.targetIndex, visibleStackIds);
        return;
      }

      onReorderStacks?.(
        drag.sourceStackId,
        toPostRemovalIndex(preview.targetIndex, visibleStackIds.indexOf(drag.sourceStackId)),
        visibleStackIds,
      );
      return;
    }

    if (preview.kind === "task-reorder") {
      const sourceTaskIndex = measurementsRef.current?.tasks.findIndex((rect) => rect.id === drag.sourceTaskId) ?? -1;
      onReorderTaskWithinStack?.(
        preview.targetStackId,
        drag.sourceTaskId ?? "",
        toPostRemovalIndex(preview.targetIndex, sourceTaskIndex),
      );
      return;
    }

    if (preview.kind === "merge") {
      onMoveTaskToStack?.(drag.sourceTaskId ?? "", preview.targetStackId);
      return;
    }

    onSplitTaskToNewStack?.(drag.sourceTaskId ?? "", preview.targetIndex, visibleStackIds);
  };

  const beginGhostReturn = (drag: DragState) => {
    const measurements = measurementsRef.current;
    const content = ghostContentRef.current;
    const delta = dragDeltaRef.current;
    if (!measurements || !content || !delta || measurements.draggedRect.width <= 0) {
      return;
    }

    setGhostExit({
      drag,
      content,
      left: measurements.draggedRect.left + delta.x,
      top: measurements.draggedRect.top + delta.y,
      width: measurements.draggedRect.width,
      mode: "return",
      exitX: -delta.x,
      exitY: -delta.y,
      exitScale: 1,
      exitOpacity: 1,
    });
    scheduleGhostExitCleanup();
  };

  const beginGhostAbsorb = (drag: DragState, target: DropTargetId) => {
    const measurements = measurementsRef.current;
    const content = ghostContentRef.current;
    const delta = dragDeltaRef.current;
    const targetRect = measurements?.sidebarTargets.find((rect) => rect.target === target);
    if (!measurements || !content || !delta || !targetRect || measurements.draggedRect.width <= 0) {
      return;
    }

    const ghostLeft = measurements.draggedRect.left + delta.x;
    const ghostTop = measurements.draggedRect.top + delta.y;
    setGhostExit({
      drag,
      content,
      left: ghostLeft,
      top: ghostTop,
      width: measurements.draggedRect.width,
      mode: "absorb",
      exitX: (targetRect.left + targetRect.right) / 2 - (ghostLeft + measurements.draggedRect.width / 2),
      exitY: (targetRect.top + targetRect.bottom) / 2 - (ghostTop + measurements.draggedRect.height / 2),
      exitScale: 0.12,
      exitOpacity: 0,
    });
    scheduleGhostExitCleanup();
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
        ghostContentRef.current = captureGhostContent(nextDragState);
        lockBodyForDrag();
        setDragState(nextDragState);
        dragStateRef.current = nextDragState;
      }
      const nextDelta = { x: event.clientX - dragState.startX, y: event.clientY - dragState.startY };
      dragDeltaRef.current = nextDelta;
      setDragDelta(nextDelta);
      const nextDropPreview = resolveDropPreview(nextDragState, event.clientX, event.clientY);
      dropPreviewRef.current = nextDropPreview;
      setDropPreview(nextDropPreview);
      useDragStore.getState().setOverDropTarget(nextDropPreview?.kind === "sidebar" ? nextDropPreview.target : null);
    };

    const releaseSuppressedClick = () => {
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
    };

    const handlePointerUp = (event: PointerEvent) => {
      const latestDragState = dragStateRef.current;
      if (!latestDragState || event.pointerId !== latestDragState.pointerId) {
        return;
      }

      if (latestDragState.active) {
        event.preventDefault();
        const preview = dropPreviewRef.current;
        if (preview?.kind === "sidebar") {
          if (preview.target === "trash") {
            onDropToTrash?.(taskIdsForDrag(latestDragState));
          } else {
            onSidebarDrop?.(taskIdsForDrag(latestDragState), preview.target);
          }
          useDragStore.getState().pulseDrop(preview.target);
          beginGhostAbsorb(latestDragState, preview.target);
        } else {
          handleDrop(latestDragState, preview);
        }
      }
      resetDrag();
      releaseSuppressedClick();
    };

    const cancelDrag = () => {
      const latestDragState = dragStateRef.current;
      if (latestDragState?.active) {
        beginGhostReturn(latestDragState);
      }
      resetDrag();
      releaseSuppressedClick();
    };

    const handlePointerCancel = (event: PointerEvent) => {
      if (event.pointerId !== dragState.pointerId) {
        return;
      }

      cancelDrag();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !dragStateRef.current) {
        return;
      }

      event.preventDefault();
      cancelDrag();
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerCancel);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerCancel);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [dragState, dropPreview, onMoveTaskToStack, onReorderStacks, onReorderTaskWithinStack, onSidebarDrop, onSplitTaskToNewStack, visibleStackIds]);

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

  // Collapsing plays the reverse of the unfold animation first (children fold
  // back under the main card, last child first), then commits the state switch.
  const requestStackCollapse = (view: TaskStackView) => {
    if (!onToggleStackCollapsed) {
      return;
    }

    const stackId = view.stack.id;
    if (collapsingStackIds.includes(stackId)) {
      return;
    }

    const childCount = view.tasks.length - 1;
    if (childCount <= 0) {
      onToggleStackCollapsed(stackId);
      return;
    }

    setCollapsingStackIds((current) => [...current, stackId]);
    const totalMs = FOLD_MS + Math.min((childCount - 1) * FOLD_STAGGER_MS, FOLD_STAGGER_CAP_MS) + 30;
    const timeoutId = window.setTimeout(() => {
      collapseTimeoutsRef.current.delete(timeoutId);
      onToggleStackCollapsed(stackId);
      setCollapsingStackIds((current) => current.filter((id) => id !== stackId));
    }, totalMs);
    collapseTimeoutsRef.current.add(timeoutId);
  };

  const collapseStackFromKey = (event: ReactKeyboardEvent, view: TaskStackView) => {
    if (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) {
      return;
    }

    event.preventDefault();
    requestStackCollapse(view);
  };

  // Push-apart offsets derived from the snapshot geometry and the live drop
  // preview. Transforms only; layout never changes while dragging.
  const activeDrag = dragState?.active ? dragState : null;
  const measurements = activeDrag ? measurementsRef.current : null;
  const hidingDrag: DragSource | null = activeDrag ?? (ghostExit?.mode === "return" ? ghostExit.drag : null);
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

  const frameShiftStyle = (shift: number): CSSProperties | undefined =>
    shift !== 0 ? { transform: `translate3d(0, ${shift}px, 0)` } : undefined;

  const renderGhostCard = (content: GhostContent) => (
    <TaskItem
      onSelect={noop}
      onToggle={noop}
      selected={false}
      stackCount={content.stackCount}
      subtask={content.subtask}
      task={content.task}
    />
  );

  const liveGhost = activeDrag && dragDelta && measurementsRef.current && ghostContentRef.current && measurementsRef.current.draggedRect.width > 0
    ? createPortal(
        <div
          aria-hidden="true"
          className="task-drag-ghost"
          data-testid="task-drag-ghost"
          style={{
            left: measurementsRef.current.draggedRect.left,
            top: measurementsRef.current.draggedRect.top,
            width: measurementsRef.current.draggedRect.width,
            transform: `translate3d(${dragDelta.x}px, ${dragDelta.y}px, 0)`,
          }}
        >
          <div
            className={cn(
              "task-drag-ghost-inner",
              ghostContentRef.current.collapsedMulti && "task-stack-collapsed-multi",
              overDropTarget && "task-drag-ghost-inner-absorb",
            )}
          >
            {renderGhostCard(ghostContentRef.current)}
          </div>
        </div>,
        document.body,
      )
    : null;

  const exitGhost = ghostExit
    ? createPortal(
        <div
          aria-hidden="true"
          className="task-drag-ghost task-drag-ghost-exit"
          style={{
            left: ghostExit.left,
            top: ghostExit.top,
            width: ghostExit.width,
            "--ghost-exit-x": `${ghostExit.exitX}px`,
            "--ghost-exit-y": `${ghostExit.exitY}px`,
            "--ghost-exit-scale": `${ghostExit.exitScale}`,
            "--ghost-exit-opacity": `${ghostExit.exitOpacity}`,
          } as CSSProperties}
        >
          <div className={cn("task-drag-ghost-inner", ghostExit.content.collapsedMulti && "task-stack-collapsed-multi")}>
            {renderGhostCard(ghostExit.content)}
          </div>
        </div>,
        document.body,
      )
    : null;

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
    const topLevelHidden = dragHidesTopLevel(hidingDrag, view.stack.id);
    const stackShift = stackShifts.get(view.stack.id) ?? 0;
    const collapsedMultiStack = !isSingleton && isCollapsed && !compact;

    if (isSingleton || isCollapsed) {
      return (
        <div
          aria-label={collapsedMultiStack ? t("stack.expand") : undefined}
          className={collapsedMultiStack ? "task-stack-shell task-stack-drag-frame task-stack-collapsed-multi" : "task-stack-shell task-stack-drag-frame"}
          data-dnd-stack-frame="true"
          data-dragging={topLevelHidden ? "true" : undefined}
          data-drop-state={stackDropState}
          data-stack-size={collapsedMultiStack ? "multi" : "single"}
          data-stack-id={view.stack.id}
          data-testid="task-stack"
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
          style={frameShiftStyle(stackShift)}
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

    const mainTaskHidden = dragHidesTask(hidingDrag, view.mainTask.id);
    const stackCollapsing = collapsingStackIds.includes(view.stack.id);
    const childCount = view.tasks.length - 1;
    const foldDurationMs = FOLD_MS + Math.min(Math.max(childCount - 1, 0) * FOLD_STAGGER_MS, FOLD_STAGGER_CAP_MS);

    return (
      <section
        className={cn("task-stack-unfolded task-stack-drag-frame", stackCollapsing && "task-stack-collapsing")}
        data-dnd-stack-frame="true"
        data-dragging={topLevelHidden ? "true" : undefined}
        data-drop-state={stackDropState}
        data-stack-id={view.stack.id}
        data-testid="task-stack-expanded"
        onClickCapture={suppressClickAfterDrag}
        onPointerDown={(event) => beginDrag(event, {
          kind: "stack",
          sourceStackId: view.stack.id,
          sourceStackSize: view.totalCount,
        })}
        style={frameShiftStyle(stackShift)}
      >
        <div
          aria-label={t("stack.collapse")}
          className="task-stack-main-frame"
          data-dnd-task-frame="true"
          data-dragging={mainTaskHidden ? "true" : undefined}
          data-stack-id={view.stack.id}
          data-task-id={view.mainTask.id}
          onDoubleClick={(event) => {
            if (!isInteractiveElement(event.target, event.currentTarget)) {
              requestStackCollapse(view);
            }
          }}
          onKeyDown={(event) => collapseStackFromKey(event, view)}
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
          style={frameShiftStyle(taskShifts.get(view.mainTask.id) ?? 0)}
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
        <div
          className={cn("task-stack-unfold-clip", stackCollapsing && "task-stack-unfold-clip-collapsing")}
          style={stackCollapsing ? { animationDuration: `${foldDurationMs}ms` } : undefined}
        >
          <div className="task-stack-unfold-panel">
          {view.tasks.slice(1).map((task, childIndex) => {
            const taskHidden = dragHidesTask(hidingDrag, task.id);
            // Unfold staggers top-down; folding reverses (last child first).
            const staggerMs = stackCollapsing
              ? Math.min((childCount - 1 - childIndex) * FOLD_STAGGER_MS, FOLD_STAGGER_CAP_MS)
              : Math.min(childIndex * UNFOLD_STAGGER_MS, UNFOLD_STAGGER_CAP_MS);
            return (
              <div
                className={cn("task-exit-wrap", leavingTaskIds.includes(task.id) && "task-exit-wrap-leaving")}
                key={task.id}
              >
                <div className="task-exit-inner">
                  <div
                    className="stack-task-drag-frame"
                    data-dnd-task-frame="true"
                    data-dragging={taskHidden ? "true" : undefined}
                    data-stack-id={view.stack.id}
                    data-task-id={task.id}
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
                    style={{ ...(frameShiftStyle(taskShifts.get(task.id) ?? 0) ?? {}), animationDelay: `${staggerMs}ms` }}
                  >
                    <TaskItem
                      onSelect={onSelect}
                      onToggle={onToggle}
                      selected={!compact && task.id === selectedTaskId}
                      subtask
                      task={task}
                    />
                  </div>
                </div>
              </div>
            );
          })}
          </div>
        </div>
      </section>
    );
  };

  // Entrance detection: animate stacks whose ids appear after the first
  // render, but skip wholesale changes (filter/search switches).
  const seenStackIdsRef = useRef<Set<string> | null>(null);
  const enterStackIds = new Set<string>();
  if (!compact) {
    const currentIds = visibleViews.map((view) => view.stack.id);
    if (seenStackIdsRef.current === null) {
      seenStackIdsRef.current = new Set(currentIds);
    } else {
      const seen = seenStackIdsRef.current;
      const freshIds = currentIds.filter((id) => !seen.has(id));
      if (freshIds.length > 0 && freshIds.length <= 3 && freshIds.length < currentIds.length) {
        freshIds.forEach((id) => enterStackIds.add(id));
      }
      currentIds.forEach((id) => seen.add(id));
    }
  }

  const isViewLeaving = (view: TaskStackView) =>
    view.tasks.length === 1 && leavingTaskIds.includes(view.tasks[0].id);

  const list = (
    <div
      className={compact ? "task-card-list-safe-area-compact space-y-2" : "task-card-list-safe-area space-y-4"}
      data-testid={testId}
      ref={listRef}
    >
      {visibleViews.map((view) => (
        <div
          className={cn(
            "task-exit-wrap",
            isViewLeaving(view) && "task-exit-wrap-leaving",
            enterStackIds.has(view.stack.id) && "task-enter-wrap",
          )}
          key={view.stack.id}
        >
          <div className="task-exit-inner">{renderStack(view)}</div>
        </div>
      ))}
      {liveGhost}
      {exitGhost}
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
