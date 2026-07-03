import type { TaskRepository } from "@/repositories/taskRepository";
import { normalizeTaskSnapshot, type TaskSnapshot } from "@/storage/taskStorage";

const cloneSnapshot = (snapshot: TaskSnapshot): TaskSnapshot => {
  const normalizedSnapshot = normalizeTaskSnapshot(snapshot);
  return {
    tasks: normalizedSnapshot.tasks.map((task) => ({ ...task, tags: [...task.tags] })),
    stacks: normalizedSnapshot.stacks.map((stack) => ({ ...stack })),
  };
};

export const createMemoryTaskRepository = (initialSnapshot: TaskSnapshot) => {
  let snapshot = cloneSnapshot(initialSnapshot);
  const savedSnapshots: TaskSnapshot[] = [];

  const repository: TaskRepository & { savedSnapshots: TaskSnapshot[] } = {
    savedSnapshots,
    async loadSnapshot() {
      return cloneSnapshot(snapshot);
    },
    async saveSnapshot(nextSnapshot) {
      snapshot = cloneSnapshot(nextSnapshot);
      savedSnapshots.push(cloneSnapshot(nextSnapshot));
    },
  };

  return repository;
};

export const flushPromises = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};
