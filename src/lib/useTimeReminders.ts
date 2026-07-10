import { useEffect, useRef } from "react";

import { playEndChime, playStartChime } from "@/lib/reminderChime";
import { collectReminderEvents, reminderEventKey, type ReminderEvent } from "@/lib/timeReminders";
import type { Task } from "@/types/task";

const TICK_MS = 1000;

type UseTimeRemindersOptions = {
  /** Master switch — pass hydrated so the missed sweep sees real tasks. */
  enabled: boolean;
  soundEnabled: boolean;
  tasks: Task[];
  onRemind: (event: ReminderEvent) => void;
  /** Reminders that elapsed while the app was closed, reported once, silently. */
  onMissed: (events: ReminderEvent[]) => void;
};

/**
 * Wall-clock reminder loop: every second, fire the start/end events crossed
 * since the previous tick (chime + callback). Events are deduped by a stable
 * key so clock adjustments or re-renders can never double-fire. On the first
 * enabled tick, events already elapsed today are swept as "missed" — reported
 * without sound instead of ringing a stale bell.
 */
export function useTimeReminders({ enabled, onMissed, onRemind, soundEnabled, tasks }: UseTimeRemindersOptions) {
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;
  const soundRef = useRef(soundEnabled);
  soundRef.current = soundEnabled;
  const callbacksRef = useRef({ onMissed, onRemind });
  callbacksRef.current = { onMissed, onRemind };

  const lastTickRef = useRef<number | null>(null);
  const firedKeysRef = useRef<Set<string>>(new Set());
  const missedSweepDoneRef = useRef(false);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    if (!missedSweepDoneRef.current) {
      missedSweepDoneRef.current = true;
      lastTickRef.current = Date.now();
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const missed = collectReminderEvents(tasksRef.current, startOfDay.getTime(), Date.now());
      missed.forEach((event) => firedKeysRef.current.add(reminderEventKey(event)));
      if (missed.length > 0) {
        callbacksRef.current.onMissed(missed);
      }
    }

    const intervalId = window.setInterval(() => {
      const now = Date.now();
      const from = lastTickRef.current ?? now;
      lastTickRef.current = now;
      const events = collectReminderEvents(tasksRef.current, from, now).filter(
        (event) => !firedKeysRef.current.has(reminderEventKey(event)),
      );
      for (const event of events) {
        firedKeysRef.current.add(reminderEventKey(event));
        if (soundRef.current) {
          (event.kind === "start" ? playStartChime : playEndChime)();
        }
        callbacksRef.current.onRemind(event);
      }
    }, TICK_MS);

    return () => window.clearInterval(intervalId);
  }, [enabled]);
}
