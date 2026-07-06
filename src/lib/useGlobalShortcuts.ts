import { useEffect, useRef } from "react";

import type { TaskFilter } from "@/types/task";

export type GlobalShortcutHandlers = {
  navigate: (direction: 1 | -1) => void;
  toggleSelected: () => void;
  deleteSelected: () => void;
  toggleSelectedStack: () => void;
  setFilter: (filter: TaskFilter) => void;
  clearSearch: () => boolean;
};

const FILTER_BY_DIGIT: Record<string, TaskFilter> = {
  "1": "today",
  "2": "all",
  "3": "important",
  "4": "pinned",
};

const isEditableTarget = (target: EventTarget | null) =>
  target instanceof HTMLElement && Boolean(target.closest("input, textarea, select, [contenteditable='true']"));

const focusBySelector = (selector: string) => {
  const element = document.querySelector<HTMLElement>(selector);
  element?.focus();
  if (element instanceof HTMLInputElement) {
    element.select();
  }
  return Boolean(element);
};

/**
 * App-wide keyboard shortcuts for Normal Mode. Inert while the focus sits in
 * an editable field or any dialog/overlay is open, so shortcuts never steal
 * keystrokes from text entry or modal flows.
 */
export function useGlobalShortcuts(enabled: boolean, handlers: GlobalShortcutHandlers) {
  const handlersRef = useRef(handlers);

  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (document.querySelector("[role='dialog']")) {
        return;
      }

      const inEditable = isEditableTarget(event.target);

      if (event.ctrlKey && !event.altKey && !event.shiftKey) {
        const key = event.key.toLowerCase();
        if (key === "n") {
          event.preventDefault();
          focusBySelector("[data-quick-add-input]");
          return;
        }
        if (key === "f") {
          event.preventDefault();
          focusBySelector("#task-search");
          return;
        }
        if (FILTER_BY_DIGIT[key] && !inEditable) {
          event.preventDefault();
          handlersRef.current.setFilter(FILTER_BY_DIGIT[key]);
          return;
        }
        return;
      }

      if (event.key === "Escape") {
        if (handlersRef.current.clearSearch()) {
          event.preventDefault();
          if (inEditable && event.target instanceof HTMLElement) {
            event.target.blur();
          }
        }
        return;
      }

      if (inEditable || event.ctrlKey || event.altKey || event.metaKey) {
        return;
      }

      switch (event.key) {
        case "ArrowDown":
          event.preventDefault();
          handlersRef.current.navigate(1);
          break;
        case "ArrowUp":
          event.preventDefault();
          handlersRef.current.navigate(-1);
          break;
        case " ":
          event.preventDefault();
          handlersRef.current.toggleSelected();
          break;
        case "Delete":
          event.preventDefault();
          handlersRef.current.deleteSelected();
          break;
        case "e":
        case "E":
          event.preventDefault();
          handlersRef.current.toggleSelectedStack();
          break;
        default:
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enabled]);
}
