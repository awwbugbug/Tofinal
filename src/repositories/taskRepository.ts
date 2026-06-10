import {
  loadTaskSnapshot,
  saveTaskSnapshot,
  type TaskSnapshot,
} from "@/storage/taskStorage";

export type TaskRepository = {
  loadSnapshot: () => TaskSnapshot;
  saveSnapshot: (snapshot: TaskSnapshot) => void;
};

export const localTaskRepository: TaskRepository = {
  loadSnapshot: loadTaskSnapshot,
  saveSnapshot: saveTaskSnapshot,
};
