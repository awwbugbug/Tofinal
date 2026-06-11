import {
  loadTaskSnapshot,
  saveTaskSnapshot,
  type TaskSnapshot,
} from "@/storage/taskStorage";
import { sqliteTaskRepository } from "@/repositories/sqliteTaskRepository";

export type TaskRepository = {
  loadSnapshot: () => Promise<TaskSnapshot>;
  saveSnapshot: (snapshot: TaskSnapshot) => Promise<void>;
};

export const localTaskRepository: TaskRepository = {
  async loadSnapshot() {
    return loadTaskSnapshot();
  },
  async saveSnapshot(snapshot) {
    saveTaskSnapshot(snapshot);
  },
};

let activeTaskRepository: TaskRepository = sqliteTaskRepository;

export const getTaskRepository = () => activeTaskRepository;

export const setTaskRepositoryForTest = (repository: TaskRepository) => {
  activeTaskRepository = repository;
};

export const resetTaskRepositoryForTest = () => {
  activeTaskRepository = sqliteTaskRepository;
};
