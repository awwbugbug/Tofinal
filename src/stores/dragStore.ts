import { create } from "zustand";

import type { TaskFilter } from "@/types/task";

/** Sidebar drop targets: the four filters plus the trash bin. */
export type DropTargetId = TaskFilter | "trash";

type DragUiState = {
  overDropTarget: DropTargetId | null;
  pulseDropTarget: DropTargetId | null;
  setOverDropTarget: (target: DropTargetId | null) => void;
  pulseDrop: (target: DropTargetId) => void;
  clearPulse: () => void;
};

/**
 * Tiny cross-component drag UI state: TaskList writes which sidebar filter the
 * pointer is hovering during a drag, Sidebar reads it for drop highlighting.
 * No task data lives here.
 */
export const useDragStore = create<DragUiState>()((set) => ({
  overDropTarget: null,
  pulseDropTarget: null,
  setOverDropTarget: (overDropTarget) =>
    set((state) => (state.overDropTarget === overDropTarget ? state : { overDropTarget })),
  pulseDrop: (pulseDropTarget) => set({ pulseDropTarget }),
  clearPulse: () => set({ pulseDropTarget: null }),
}));
